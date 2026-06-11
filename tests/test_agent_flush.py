"""Tests for `iris agent flush` and the push piggyback (issue #86).

The HTTP POST is stubbed via the `_post_fn` seam (flush_spool) or by
monkeypatching `iris.agent.flush._post` (maybe_flush_quietly), so no test
touches the network.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import iris.agent.flush as flush
import iris.platform.config as config


def _write_spool(path, records):
    path.write_text("".join(json.dumps(r) + "\n" for r in records))


def _record(model="claude-opus-4-8", key="k"):
    return {
        "schema": "iris.agent_usage.v1",
        "agent": "claude_code",
        "repo": "acme/web",
        "period": "2026-06-11",
        "model": model,
        "input_tokens": 1,
        "output_tokens": 1,
        "cache_read_input_tokens": 0,
        "cache_creation_input_tokens": 0,
        "tool_calls": 0,
        "sidechain_tool_calls": 0,
        "sessions": 1,
        "duration_bucket": "1-5m",
        "idempotency_key": key,
    }


def test_flush_sends_and_drains_spool(tmp_path):
    spool = tmp_path / "spool.jsonl"
    _write_spool(spool, [_record(key="a"), _record(key="b")])
    sent_batches = []

    def fake_post(records):
        sent_batches.append(records)
        return {"applied": len(records), "duplicates": 0}

    result = flush.flush_spool("https://s", "tok", spool_file=str(spool), _post_fn=fake_post)
    assert result == {"sent": 2, "applied": 2, "duplicates": 0, "remaining": 0}
    assert len(sent_batches) == 1 and len(sent_batches[0]) == 2
    assert not spool.exists()  # drained


def test_flush_batches_large_spools(tmp_path):
    spool = tmp_path / "spool.jsonl"
    _write_spool(spool, [_record(key=str(i)) for i in range(5)])
    calls = []

    def fake_post(records):
        calls.append(len(records))
        return {"applied": len(records), "duplicates": 0}

    result = flush.flush_spool(
        "https://s", "tok", spool_file=str(spool), batch_max=2, _post_fn=fake_post
    )
    assert calls == [2, 2, 1]  # drained in batches of 2
    assert result["sent"] == 5
    assert result["remaining"] == 0


def test_flush_leaves_spool_intact_on_failure(tmp_path):
    spool = tmp_path / "spool.jsonl"
    _write_spool(spool, [_record(key="a"), _record(key="b")])

    def failing_post(records):
        raise RuntimeError("network down")

    try:
        flush.flush_spool("https://s", "tok", spool_file=str(spool), _post_fn=failing_post)
        assert False, "expected RuntimeError"
    except RuntimeError:
        pass
    # Nothing sent → spool preserved for retry.
    assert len(spool.read_text().splitlines()) == 2


def test_flush_empty_spool_is_noop(tmp_path):
    spool = tmp_path / "spool.jsonl"
    called = []
    result = flush.flush_spool(
        "https://s", "tok", spool_file=str(spool), _post_fn=lambda r: called.append(r)
    )
    assert result == {"sent": 0, "applied": 0, "duplicates": 0, "remaining": 0}
    assert called == []


def test_flush_preserves_lines_appended_during_send(tmp_path):
    # Simulate `record` appending a new session while the POST is in flight.
    spool = tmp_path / "spool.jsonl"
    _write_spool(spool, [_record(key="a"), _record(key="b")])

    def post_then_append(records):
        if len(records) == 2:  # first batch — a new record lands mid-flush
            with open(spool, "a") as f:
                f.write(json.dumps(_record(key="c")) + "\n")
        return {"applied": len(records), "duplicates": 0}

    result = flush.flush_spool(
        "https://s", "tok", spool_file=str(spool), _post_fn=post_then_append
    )
    # The late record 'c' is preserved and sent on the next drain pass.
    assert result["sent"] == 3
    assert result["remaining"] == 0
    assert not spool.exists()


def test_flush_drops_malformed_lines(tmp_path):
    spool = tmp_path / "spool.jsonl"
    spool.write_text(json.dumps(_record(key="a")) + "\nnot json\n")
    posted = []

    def fake_post(records):
        posted.append(records)
        return {"applied": len(records), "duplicates": 0}

    result = flush.flush_spool("https://s", "tok", spool_file=str(spool), _post_fn=fake_post)
    assert result["sent"] == 1  # only the valid record
    assert len(posted[0]) == 1
    assert not spool.exists()  # malformed line dropped too


# --- maybe_flush_quietly (push piggyback) -----------------------------------


def _isolate(tmp_path, monkeypatch, *, enabled):
    spool = tmp_path / "spool.jsonl"
    monkeypatch.setattr(flush, "SPOOL_FILE", str(spool))
    monkeypatch.setattr(config, "CONFIG_DIR", str(tmp_path))
    monkeypatch.setattr(config, "CONFIG_FILE", str(tmp_path / "config.json"))
    (tmp_path / "config.json").write_text(
        json.dumps({"agent_telemetry_enabled": enabled})
    )
    return spool


def test_maybe_flush_skips_when_disabled(tmp_path, monkeypatch):
    spool = _isolate(tmp_path, monkeypatch, enabled=False)
    _write_spool(spool, [_record()])
    monkeypatch.setattr(flush, "_post", lambda *a: (_ for _ in ()).throw(AssertionError("posted")))
    assert flush.maybe_flush_quietly("https://s", "tok") is None
    assert spool.exists()  # untouched


def test_maybe_flush_skips_when_spool_empty(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch, enabled=True)
    assert flush.maybe_flush_quietly("https://s", "tok") is None


def test_maybe_flush_swallows_errors(tmp_path, monkeypatch):
    spool = _isolate(tmp_path, monkeypatch, enabled=True)
    _write_spool(spool, [_record()])

    def boom(*a):
        raise RuntimeError("server 500")

    monkeypatch.setattr(flush, "_post", boom)
    assert flush.maybe_flush_quietly("https://s", "tok") is None
    assert spool.exists()  # preserved for retry


def test_maybe_flush_sends_when_enabled(tmp_path, monkeypatch):
    spool = _isolate(tmp_path, monkeypatch, enabled=True)
    _write_spool(spool, [_record(key="a")])
    monkeypatch.setattr(flush, "_post", lambda *a: {"applied": 1, "duplicates": 0})
    result = flush.maybe_flush_quietly("https://s", "tok")
    assert result["sent"] == 1
    assert not spool.exists()
