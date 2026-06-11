"""Edge recorder — turns a parsed session into anonymous wire records and
spools them locally.

This is where the privacy boundary is enforced: a local ``ParsedSession`` (which
knew the transcript path and cwd) becomes a list of ``UsageRecord`` that carry
only ``(repo, day, model)`` plus counts. The repo is derived from the local git
remote and then discarded; the exact timestamps collapse into one coarse
``duration_bucket``; the session id survives only as an opaque hash.

Until #68 ships the ingest endpoint, records are appended to a local spool
(``~/.iris/agent-usage/spool.jsonl``). The spool is already anonymous — it holds
wire records, not transcripts — so #68 only needs to flush and POST it.
"""

import hashlib
import json
import os

from iris.agent.claude_code import _to_dt, parse_session
from iris.models.agent_usage import ParsedSession, UsageRecord

AGENT_ID = "claude_code"

SPOOL_DIR = os.path.expanduser("~/.iris/agent-usage")
SPOOL_FILE = os.path.join(SPOOL_DIR, "spool.jsonl")


def duration_bucket(first_ts: str | None, last_ts: str | None) -> str:
    """Collapse a session's wall-clock span into a coarse bucket.

    Exact durations never leave the edge; only the bucket does.
    """
    start, end = _to_dt(first_ts), _to_dt(last_ts)
    if start is None or end is None:
        return "unknown"
    minutes = max(0.0, (end - start).total_seconds() / 60.0)
    if minutes < 1:
        return "<1m"
    if minutes < 5:
        return "1-5m"
    if minutes < 15:
        return "5-15m"
    if minutes < 60:
        return "15-60m"
    if minutes < 240:
        return "1-4h"
    return ">4h"


def _idempotency_key(session_id: object) -> str:
    """Opaque, non-reversible handle for a session — for #68 dedup only.

    The session id is already a random UUID (not identity); hashing it means
    even that random token never leaves the machine in the clear.
    """
    if not isinstance(session_id, str) or not session_id:
        return ""
    return hashlib.sha256(session_id.encode("utf-8")).hexdigest()[:16]


def build_records(
    parsed: ParsedSession, repo: str, session_id: object
) -> list[UsageRecord]:
    """Strip a parsed session down to anonymous ``(repo, day, model)`` records."""
    bucket = duration_bucket(parsed.first_ts, parsed.last_ts)
    key = _idempotency_key(session_id)
    records = []
    for agg in parsed.aggregates:
        # Skip empty slices (e.g. a model line with no usage and no tools).
        if agg.assistant_messages == 0 and agg.tool_calls == 0:
            continue
        records.append(
            UsageRecord(
                repo=repo,
                period=agg.period,
                model=agg.model,
                agent=AGENT_ID,
                input_tokens=agg.input_tokens,
                output_tokens=agg.output_tokens,
                cache_read_input_tokens=agg.cache_read_input_tokens,
                cache_creation_input_tokens=agg.cache_creation_input_tokens,
                tool_calls=agg.tool_calls,
                sidechain_tool_calls=agg.sidechain_tool_calls,
                sessions=1,
                duration_bucket=bucket,
                idempotency_key=key,
            )
        )
    return records


def _derive_repo(cwd: object) -> str | None:
    """Derive ``owner/repo`` from the working directory's git remote.

    Used only to label the aggregate; the path itself is never recorded.
    """
    if not isinstance(cwd, str) or not cwd or not os.path.isdir(cwd):
        return None
    try:
        from iris.ingestion.github_reader import detect_github_remote

        return detect_github_remote(cwd)
    except Exception:
        return None


def spool_records(records: list[UsageRecord], spool_file: str = SPOOL_FILE) -> int:
    """Append anonymous records to the local spool. Returns the count written."""
    if not records:
        return 0
    os.makedirs(os.path.dirname(spool_file), exist_ok=True)
    with open(spool_file, "a", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record.to_wire(), sort_keys=True) + "\n")
    return len(records)


def record_from_event(event: dict, spool_file: str = SPOOL_FILE) -> int:
    """Process one SessionEnd event into spooled anonymous records.

    ``event`` is the JSON the Claude Code SessionEnd hook delivers on stdin:
    ``{session_id, transcript_path, cwd, ...}``. Returns the number of records
    written (0 if the session can't be attributed or has no usage).
    """
    transcript_path = event.get("transcript_path")
    if not isinstance(transcript_path, str) or not os.path.isfile(transcript_path):
        return 0

    repo = _derive_repo(event.get("cwd"))
    if not repo:
        # No known repo to attribute to — drop it rather than guess.
        return 0

    parsed = parse_session(transcript_path)
    records = build_records(parsed, repo, event.get("session_id"))
    return spool_records(records, spool_file)


def record_from_stdin() -> int:
    """Entry point for ``iris agent record`` (the SessionEnd hook command).

    Reads the event JSON from stdin and spools anonymous records. Designed to
    NEVER raise into the agent session: any failure is swallowed and reported
    as zero records written.
    """
    import sys

    try:
        raw = sys.stdin.read()
        event = json.loads(raw) if raw.strip() else {}
        if not isinstance(event, dict):
            return 0
        return record_from_event(event)
    except Exception:
        return 0


def spool_stats(spool_file: str = SPOOL_FILE) -> dict:
    """Return ``{records, path, exists}`` for the local spool."""
    if not os.path.isfile(spool_file):
        return {"records": 0, "path": spool_file, "exists": False}
    count = 0
    try:
        with open(spool_file, encoding="utf-8") as f:
            count = sum(1 for line in f if line.strip())
    except OSError:
        pass
    return {"records": count, "path": spool_file, "exists": True}
