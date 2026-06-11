"""Tests for default-on-with-disclosure first run (consent ADR, 2026-06-11).

`_maybe_init_agent_telemetry` auto-enables telemetry once, for Claude Code
users only, with a disclosure and a remembered opt-out. All filesystem effects
are redirected into a tmp HOME.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import iris.agent.recorder as recorder
import iris.agent.settings_hook as sh
import iris.cli as cli
import iris.platform.config as config


def _isolate(tmp_path, monkeypatch, *, claude_user: bool):
    claude = tmp_path / ".claude" / "settings.json"
    monkeypatch.setattr(sh, "_settings_path", lambda: str(claude))
    monkeypatch.setattr(config, "CONFIG_DIR", str(tmp_path / ".iris"))
    monkeypatch.setattr(config, "CONFIG_FILE", str(tmp_path / ".iris" / "config.json"))
    monkeypatch.setattr(
        recorder, "SPOOL_FILE", str(tmp_path / ".iris" / "agent-usage" / "spool.jsonl")
    )
    if claude_user:
        claude.parent.mkdir(parents=True, exist_ok=True)  # ~/.claude exists
    return claude


def _cfg(tmp_path):
    f = tmp_path / ".iris" / "config.json"
    return json.loads(f.read_text()) if f.exists() else {}


def test_first_run_auto_enables_for_claude_user(tmp_path, monkeypatch, capsys):
    claude = _isolate(tmp_path, monkeypatch, claude_user=True)
    enabled = cli._maybe_init_agent_telemetry(["analyze", "."])
    assert enabled is True

    data = json.loads(claude.read_text())
    cmds = [h["command"] for e in data["hooks"]["SessionEnd"] for h in e["hooks"]]
    assert any("agent record" in c for c in cmds)

    cfg = _cfg(tmp_path)
    assert cfg["agent_telemetry_enabled"] is True
    assert cfg["agent_telemetry_initialized"] is True

    # Disclosure is shown (on stderr), and mentions the off switch.
    err = capsys.readouterr().err
    assert "telemetry is now ON" in err
    assert "iris agent disable" in err


def test_first_run_is_one_time(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch, claude_user=True)
    assert cli._maybe_init_agent_telemetry(["push"]) is True
    assert cli._maybe_init_agent_telemetry(["push"]) is False  # already decided


def test_first_run_skips_non_claude_user(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch, claude_user=False)  # no ~/.claude
    assert cli._maybe_init_agent_telemetry(["analyze", "."]) is False
    # Nothing recorded — a later install of Claude Code can still auto-enable.
    assert "agent_telemetry_initialized" not in _cfg(tmp_path)


def test_first_run_respects_prior_disable(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch, claude_user=True)
    sh.disable()  # explicit opt-out before first auto-run
    assert cli._maybe_init_agent_telemetry(["analyze", "."]) is False
    assert _cfg(tmp_path)["agent_telemetry_enabled"] is False


def test_first_run_skips_agent_and_meta_commands(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch, claude_user=True)
    for argv in (["agent", "status"], ["--version"], ["--help"], ["upgrade"], []):
        assert cli._maybe_init_agent_telemetry(argv) is False
    assert "agent_telemetry_initialized" not in _cfg(tmp_path)
