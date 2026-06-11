"""Claude Code transcript adapter — the local, privacy-bounded parser.

This is the auditable core of the telemetry guarantee. It reads a Claude Code
session transcript (`~/.claude/projects/**/*.jsonl`) and reduces it to
per-(model, day) token/tool aggregates. It is deliberately written so the
privacy boundary is visible in the diff:

ALLOW-LIST — the parser reads ONLY these fields:
  - line ``type``           (to keep only "assistant" lines)
  - line ``isSidechain``    (sub-agent attribution)
  - line ``timestamp``      (reduced to a UTC day)
  - ``message.id``          (dedup key — see below)
  - ``message.model``
  - ``message.usage.{input_tokens, output_tokens,
                     cache_read_input_tokens, cache_creation_input_tokens}``
  - ``message.content[].type``  (only to COUNT tool_use blocks)

NEVER READ — there is no code path that touches:
  - ``content[].text`` / ``content[].thinking`` / ``content[].input``
  - any ``type == "user"`` or ``type == "attachment"`` line
  - ``cwd`` / ``gitBranch`` / user / host / file paths

Token de-duplication: Claude Code writes one assistant *turn* as several JSONL
lines — one per content block (thinking, text, each tool_use) — and every one
of those lines carries an identical copy of ``message.usage``. Summing usage
per line over-counts ~3x. We dedupe token sums by ``message.id`` and take usage
once. Tool calls, by contrast, ARE one-per-block, so they are counted across
every line without de-duplication.
"""

from datetime import datetime, timezone

from iris.models.agent_usage import ParsedSession, SessionAggregate

# The only usage sub-fields the parser is allowed to read.
USAGE_FIELDS = (
    "input_tokens",
    "output_tokens",
    "cache_read_input_tokens",
    "cache_creation_input_tokens",
)


def _utc_day(ts: object) -> str | None:
    """Reduce an ISO-8601 timestamp to a UTC calendar day (YYYY-MM-DD)."""
    if not isinstance(ts, str) or not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).date().isoformat()


def _to_dt(ts: object) -> datetime | None:
    if not isinstance(ts, str) or not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _tool_use_count(content: object) -> int:
    """Count ``tool_use`` blocks in a message's content array.

    Reads ONLY each block's ``type``. It structurally cannot reach the prompt,
    the model's text/thinking, or tool arguments.
    """
    if not isinstance(content, list):
        return 0
    return sum(
        1 for c in content if isinstance(c, dict) and c.get("type") == "tool_use"
    )


def _iter_json_lines(path: str):
    """Yield parsed JSON objects from a JSONL file, skipping malformed lines."""
    import json

    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue
    except OSError:
        return


def parse_session(transcript_path: str) -> ParsedSession:
    """Parse one Claude Code transcript into anonymous per-(model, day) slices.

    Returns aggregates plus the session's wall-clock span (used later to bucket
    duration). Identity is never read, so the result is already free of it.
    """
    # accumulator keyed by (model, period) -> mutable dict
    groups: dict[tuple[str, str], dict] = {}
    seen_message_ids: set[str] = set()
    first_dt: datetime | None = None
    last_dt: datetime | None = None

    for line in _iter_json_lines(transcript_path):
        if not isinstance(line, dict) or line.get("type") != "assistant":
            continue
        message = line.get("message")
        if not isinstance(message, dict):
            continue

        model = message.get("model") or "unknown"
        period = _utc_day(line.get("timestamp")) or "unknown"
        is_sidechain = bool(line.get("isSidechain"))
        key = (model, period)
        acc = groups.setdefault(
            key,
            {f: 0 for f in USAGE_FIELDS}
            | {"tool_calls": 0, "sidechain_tool_calls": 0, "assistant_messages": 0},
        )

        # Tokens: once per message.id (turn), not once per content-block line.
        mid = message.get("id")
        if isinstance(mid, str) and mid not in seen_message_ids:
            seen_message_ids.add(mid)
            usage = message.get("usage")
            if isinstance(usage, dict):
                for field in USAGE_FIELDS:
                    value = usage.get(field)
                    if isinstance(value, (int, float)):
                        acc[field] += int(value)
            acc["assistant_messages"] += 1

        # Tool calls: every block counts (each is a distinct call).
        n_tools = _tool_use_count(message.get("content"))
        acc["tool_calls"] += n_tools
        if is_sidechain:
            acc["sidechain_tool_calls"] += n_tools

        dt = _to_dt(line.get("timestamp"))
        if dt is not None:
            first_dt = dt if first_dt is None or dt < first_dt else first_dt
            last_dt = dt if last_dt is None or dt > last_dt else last_dt

    aggregates = tuple(
        SessionAggregate(
            model=model,
            period=period,
            input_tokens=acc["input_tokens"],
            output_tokens=acc["output_tokens"],
            cache_read_input_tokens=acc["cache_read_input_tokens"],
            cache_creation_input_tokens=acc["cache_creation_input_tokens"],
            tool_calls=acc["tool_calls"],
            sidechain_tool_calls=acc["sidechain_tool_calls"],
            assistant_messages=acc["assistant_messages"],
        )
        for (model, period), acc in sorted(groups.items())
    )

    return ParsedSession(
        aggregates=aggregates,
        first_ts=first_dt.isoformat() if first_dt else None,
        last_ts=last_dt.isoformat() if last_dt else None,
    )
