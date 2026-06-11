"""Tests for the Claude Code usage adapter (issue #67, epic #65).

The fixture `fixtures/claude_session.jsonl` reproduces the real transcript
shape — most importantly that one assistant *turn* is written as several JSONL
lines, each carrying an identical copy of `message.usage`. The headline test is
that token sums are de-duplicated by `message.id` (summing per line over-counts
~3x) while tool_use blocks are counted per block.

The fixture intentionally contains placeholder text in `content[].text`,
`.thinking`, `tool_use.input`, and in `user`/`attachment` lines, plus a decoy
`usage` on a `user` line. None of it may ever influence the result.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.agent.claude_code import parse_session
from iris.agent.recorder import build_records, duration_bucket, record_from_event
from iris.models.agent_usage import USAGE_SCHEMA

FIXTURE = str(Path(__file__).resolve().parent / "fixtures" / "claude_session.jsonl")


def _by_model(parsed):
    return {a.model: a for a in parsed.aggregates}


def test_tokens_are_deduped_by_message_id():
    # msg_a appears on 4 lines with identical usage; it must count ONCE.
    opus = _by_model(parse_session(FIXTURE))["claude-opus-4-8"]
    assert opus.input_tokens == 300  # 100 (msg_a, once) + 200 (msg_b)
    assert opus.output_tokens == 30  # 10 (msg_a, once) + 20 (msg_b)
    assert opus.cache_read_input_tokens == 50
    assert opus.cache_creation_input_tokens == 20
    assert opus.assistant_messages == 2


def test_naive_per_line_sum_would_overcount():
    # Guards the dedup: summing output_tokens per assistant line gives 65
    # (msg_a x4 = 40, msg_b = 20, msg_c = 5); the deduped engine gives 35.
    with open(FIXTURE, encoding="utf-8") as f:
        lines = [json.loads(x) for x in f if x.strip() and not x.startswith("not ")]
    naive = sum(
        l["message"]["usage"]["output_tokens"]
        for l in lines
        if l.get("type") == "assistant"
    )
    parsed = parse_session(FIXTURE)
    deduped = sum(a.output_tokens for a in parsed.aggregates)
    assert naive == 65
    assert deduped == 35
    assert deduped != naive


def test_tool_use_blocks_counted_per_block():
    by_model = _by_model(parse_session(FIXTURE))
    assert by_model["claude-opus-4-8"].tool_calls == 2  # msg_a: 2 tool_use lines
    assert by_model["claude-haiku-4-5"].tool_calls == 2  # msg_c: 2 blocks, one line


def test_sidechain_tool_calls_split_out():
    by_model = _by_model(parse_session(FIXTURE))
    assert by_model["claude-opus-4-8"].sidechain_tool_calls == 0
    assert by_model["claude-haiku-4-5"].sidechain_tool_calls == 2


def test_grouped_by_model():
    models = {a.model for a in parse_session(FIXTURE).aggregates}
    assert models == {"claude-opus-4-8", "claude-haiku-4-5"}


def test_user_and_attachment_lines_ignored():
    # The user line carries a decoy usage of 9999 on every field; it must not
    # leak into any aggregate, and the malformed line must not raise.
    parsed = parse_session(FIXTURE)
    assert all(a.input_tokens < 9999 for a in parsed.aggregates)
    assert sum(a.assistant_messages for a in parsed.aggregates) == 3  # a, b, c


def test_period_is_utc_day():
    for agg in parse_session(FIXTURE).aggregates:
        assert agg.period == "2026-06-11"


def test_duration_bucketing():
    assert duration_bucket("2026-06-11T16:00:00+00:00", "2026-06-11T16:45:00+00:00") == "15-60m"
    assert duration_bucket("2026-06-11T16:00:00+00:00", "2026-06-11T16:00:30+00:00") == "<1m"
    assert duration_bucket("2026-06-11T10:00:00+00:00", "2026-06-11T15:00:00+00:00") == ">4h"
    assert duration_bucket(None, None) == "unknown"


def test_session_span_drives_bucket():
    parsed = parse_session(FIXTURE)
    assert duration_bucket(parsed.first_ts, parsed.last_ts) == "15-60m"


def test_build_records_strips_to_anonymous_wire():
    parsed = parse_session(FIXTURE)
    records = build_records(parsed, "acme/web", "sess-test")
    assert len(records) == 2
    wire = [r.to_wire() for r in records]

    # Identity-bearing keys must be absent from the wire shape entirely.
    forbidden = {"cwd", "user", "email", "host", "path", "session_id", "branch", "gitBranch"}
    for w in wire:
        assert forbidden.isdisjoint(w.keys())
        assert w["schema"] == USAGE_SCHEMA
        assert w["repo"] == "acme/web"
        assert w["period"] == "2026-06-11"
        assert w["agent"] == "claude_code"
        assert w["sessions"] == 1
        assert w["duration_bucket"] == "15-60m"
        # idempotency key is an opaque hash, never the raw session id
        assert w["idempotency_key"] and w["idempotency_key"] != "sess-test"
        assert len(w["idempotency_key"]) == 16


def test_record_from_event_spools_anonymous_records(tmp_path, monkeypatch):
    # cwd in a test isn't a real git repo; stub the repo derivation.
    monkeypatch.setattr("iris.agent.recorder._derive_repo", lambda cwd: "acme/web")
    spool = tmp_path / "spool.jsonl"
    event = {
        "session_id": "sess-test",
        "transcript_path": FIXTURE,
        "cwd": "/home/dev/acme-web",
    }
    written = record_from_event(event, spool_file=str(spool))
    assert written == 2

    rows = [json.loads(l) for l in spool.read_text().splitlines() if l.strip()]
    assert len(rows) == 2
    assert {r["model"] for r in rows} == {"claude-opus-4-8", "claude-haiku-4-5"}
    assert all(r["repo"] == "acme/web" for r in rows)


def test_record_from_event_skips_unknown_repo(tmp_path, monkeypatch):
    monkeypatch.setattr("iris.agent.recorder._derive_repo", lambda cwd: None)
    spool = tmp_path / "spool.jsonl"
    written = record_from_event(
        {"session_id": "s", "transcript_path": FIXTURE, "cwd": "/x"},
        spool_file=str(spool),
    )
    assert written == 0
    assert not spool.exists()


def test_record_from_event_handles_missing_transcript(tmp_path):
    spool = tmp_path / "spool.jsonl"
    written = record_from_event(
        {"session_id": "s", "transcript_path": "/no/such/file.jsonl", "cwd": "/x"},
        spool_file=str(spool),
    )
    assert written == 0
