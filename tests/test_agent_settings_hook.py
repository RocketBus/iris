"""Tests for `iris agent enable|disable|status` (issue #67).

All filesystem effects are redirected into a tmp HOME so the real
`~/.claude/settings.json` and `~/.iris/config.json` are never touched.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import iris.agent.recorder as recorder
import iris.agent.settings_hook as sh
import iris.platform.config as config


def _isolate(tmp_path, monkeypatch):
    claude = tmp_path / ".claude" / "settings.json"
    monkeypatch.setattr(sh, "_settings_path", lambda: str(claude))
    monkeypatch.setattr(config, "CONFIG_DIR", str(tmp_path / ".iris"))
    monkeypatch.setattr(config, "CONFIG_FILE", str(tmp_path / ".iris" / "config.json"))
    monkeypatch.setattr(
        recorder, "SPOOL_FILE", str(tmp_path / ".iris" / "agent-usage" / "spool.jsonl")
    )
    return claude


def _iris_commands(settings: dict) -> list[str]:
    return [
        h["command"]
        for e in settings["hooks"]["SessionEnd"]
        for h in e["hooks"]
        if "agent record" in h["command"]
    ]


def test_enable_adds_session_end_hook(tmp_path, monkeypatch):
    claude = _isolate(tmp_path, monkeypatch)
    info = sh.enable()
    assert info["already_enabled"] is False

    data = json.loads(claude.read_text())
    assert len(_iris_commands(data)) == 1

    cfg = json.loads((tmp_path / ".iris" / "config.json").read_text())
    assert cfg["agent_telemetry_enabled"] is True


def test_enable_is_idempotent(tmp_path, monkeypatch):
    claude = _isolate(tmp_path, monkeypatch)
    sh.enable()
    info = sh.enable()
    assert info["already_enabled"] is True
    data = json.loads(claude.read_text())
    assert len(_iris_commands(data)) == 1  # not duplicated


def test_enable_preserves_other_hooks(tmp_path, monkeypatch):
    claude = _isolate(tmp_path, monkeypatch)
    claude.parent.mkdir(parents=True, exist_ok=True)
    claude.write_text(
        json.dumps(
            {
                "model": "opus",
                "hooks": {
                    "PreToolUse": [
                        {"matcher": "Bash", "hooks": [{"type": "command", "command": "echo hi"}]}
                    ],
                    "SessionEnd": [
                        {"hooks": [{"type": "command", "command": "my-own-hook"}]}
                    ],
                },
            }
        )
    )
    sh.enable()
    data = json.loads(claude.read_text())
    assert data["model"] == "opus"
    assert data["hooks"]["PreToolUse"][0]["hooks"][0]["command"] == "echo hi"
    all_cmds = [h["command"] for e in data["hooks"]["SessionEnd"] for h in e["hooks"]]
    assert "my-own-hook" in all_cmds
    assert _iris_commands(data)


def test_disable_removes_only_iris_hook(tmp_path, monkeypatch):
    claude = _isolate(tmp_path, monkeypatch)
    claude.parent.mkdir(parents=True, exist_ok=True)
    claude.write_text(
        json.dumps(
            {"hooks": {"SessionEnd": [{"hooks": [{"type": "command", "command": "my-own-hook"}]}]}}
        )
    )
    sh.enable()
    info = sh.disable()
    assert info["removed"] is True

    data = json.loads(claude.read_text())
    all_cmds = [h["command"] for e in data["hooks"]["SessionEnd"] for h in e["hooks"]]
    assert "my-own-hook" in all_cmds
    assert not _iris_commands(data)


def test_disable_when_not_enabled_is_safe(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    info = sh.disable()
    assert info["removed"] is False


def test_status_reflects_state(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    assert sh.status()["hook_registered"] is False
    sh.enable()
    st = sh.status()
    assert st["hook_registered"] is True
    assert st["flag"] is True
    assert st["spool"]["records"] == 0
