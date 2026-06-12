"""Tests for silent, opt-out CLI self-update (issue #102).

Mirrors the agent-telemetry consent tests: `_maybe_init_auto_update`
auto-enables once (interactive + self-manageable installs only), and
`maybe_auto_update` fires a detached upgrade only when enabled, newer, managed,
and not yet attempted today. All filesystem and process effects are redirected
into a tmp HOME / fakes.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import iris.cli as cli
import iris.platform.config as config
import iris.update.auto as auto


def _isolate(tmp_path, monkeypatch):
    iris_dir = tmp_path / ".iris"
    monkeypatch.setattr(config, "CONFIG_DIR", str(iris_dir))
    monkeypatch.setattr(config, "CONFIG_FILE", str(iris_dir / "config.json"))
    # auto.py bound these at import time from config.CONFIG_DIR — repoint them.
    monkeypatch.setattr(auto, "CONFIG_DIR", str(iris_dir))
    monkeypatch.setattr(auto, "STAMP_FILE", str(iris_dir / ".last_auto_update"))
    monkeypatch.setattr(auto, "LOG_FILE", str(iris_dir / "auto_update.log"))
    monkeypatch.delenv(auto.ENV_OPT_OUT, raising=False)
    return iris_dir


def _cfg(tmp_path):
    f = tmp_path / ".iris" / "config.json"
    return json.loads(f.read_text()) if f.exists() else {}


# --- version comparison -----------------------------------------------------


def test_version_is_newer():
    assert auto.version_is_newer("v1.4.5", "v1.4.4") is True
    assert auto.version_is_newer("v2.0.0", "v1.9.9") is True
    assert auto.version_is_newer("1.5.0", "v1.4.9") is True
    assert auto.version_is_newer("v1.4.4", "v1.4.4") is False
    assert auto.version_is_newer("v1.4.3", "v1.4.4") is False
    assert auto.version_is_newer(None, "v1.4.4") is False
    # Pre-release suffixes don't break parsing.
    assert auto.version_is_newer("1.4.4-rc1", "1.4.3") is True


# --- opt-out toggles --------------------------------------------------------


def test_enable_disable_persist(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    auto.enable()
    assert _cfg(tmp_path)["auto_update_enabled"] is True
    assert _cfg(tmp_path)["auto_update_initialized"] is True
    auto.disable()
    assert _cfg(tmp_path)["auto_update_enabled"] is False
    assert _cfg(tmp_path)["auto_update_initialized"] is True


def test_env_opt_out_overrides_flag(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    auto.enable()
    assert auto.is_enabled() is True
    monkeypatch.setenv(auto.ENV_OPT_OUT, "1")
    assert auto.is_enabled() is False


# --- first-run init ---------------------------------------------------------


def test_first_run_auto_enables_interactive_managed(tmp_path, monkeypatch, capsys):
    _isolate(tmp_path, monkeypatch)
    monkeypatch.setattr(auto, "_managed_install", lambda: True)
    monkeypatch.setattr(sys.stderr, "isatty", lambda: True, raising=False)

    assert cli._maybe_init_auto_update(["analyze", "."]) is True
    cfg = _cfg(tmp_path)
    assert cfg["auto_update_enabled"] is True
    assert cfg["auto_update_initialized"] is True

    err = capsys.readouterr().err
    assert "keep itself up to date" in err
    assert "iris upgrade --disable-auto" in err


def test_first_run_is_one_time(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    monkeypatch.setattr(auto, "_managed_install", lambda: True)
    monkeypatch.setattr(sys.stderr, "isatty", lambda: True, raising=False)
    assert cli._maybe_init_auto_update(["push"]) is True
    assert cli._maybe_init_auto_update(["push"]) is False  # already decided


def test_first_run_skips_non_tty(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    monkeypatch.setattr(auto, "_managed_install", lambda: True)
    monkeypatch.setattr(sys.stderr, "isatty", lambda: False, raising=False)
    # Background hook path: disclosure would be swallowed, so don't enable.
    assert cli._maybe_init_auto_update(["analyze", "."]) is False
    assert "auto_update_initialized" not in _cfg(tmp_path)


def test_first_run_skips_unmanaged_install(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    monkeypatch.setattr(auto, "_managed_install", lambda: False)
    monkeypatch.setattr(sys.stderr, "isatty", lambda: True, raising=False)
    assert cli._maybe_init_auto_update(["analyze", "."]) is False
    assert "auto_update_initialized" not in _cfg(tmp_path)


def test_first_run_skips_meta_commands(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    monkeypatch.setattr(auto, "_managed_install", lambda: True)
    monkeypatch.setattr(sys.stderr, "isatty", lambda: True, raising=False)
    for argv in (["upgrade"], ["agent", "status"], ["--version"], ["login"], []):
        assert cli._maybe_init_auto_update(argv) is False
    assert "auto_update_initialized" not in _cfg(tmp_path)


def test_first_run_respects_prior_disable(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    monkeypatch.setattr(auto, "_managed_install", lambda: True)
    monkeypatch.setattr(sys.stderr, "isatty", lambda: True, raising=False)
    auto.disable()  # explicit opt-out before first auto-run
    assert cli._maybe_init_auto_update(["analyze", "."]) is False
    assert _cfg(tmp_path)["auto_update_enabled"] is False


# --- the silent update ------------------------------------------------------


class _FakePopen:
    calls: list = []

    def __init__(self, args, **kwargs):
        _FakePopen.calls.append((args, kwargs))


def _arm(tmp_path, monkeypatch, *, managed=True):
    _isolate(tmp_path, monkeypatch)
    auto.enable()
    monkeypatch.setattr(auto, "_managed_install", lambda: managed)
    _FakePopen.calls = []
    monkeypatch.setattr(auto.subprocess, "Popen", _FakePopen)


def test_auto_update_launches_when_newer(tmp_path, monkeypatch):
    _arm(tmp_path, monkeypatch)
    assert auto.maybe_auto_update("v1.4.5", "https://app.example.com", "v1.4.4") is True
    assert len(_FakePopen.calls) == 1
    args, kwargs = _FakePopen.calls[0]
    assert "https://app.example.com/install.sh" in args[2]
    assert kwargs.get("start_new_session") is True
    # Stamp written so it won't relaunch on the next push today.
    assert (tmp_path / ".iris" / ".last_auto_update").exists()


def test_auto_update_skips_when_disabled(tmp_path, monkeypatch):
    _arm(tmp_path, monkeypatch)
    auto.disable()
    assert auto.maybe_auto_update("v1.4.5", "https://app.example.com", "v1.4.4") is False
    assert _FakePopen.calls == []


def test_auto_update_skips_when_not_newer(tmp_path, monkeypatch):
    _arm(tmp_path, monkeypatch)
    assert auto.maybe_auto_update("v1.4.4", "https://app.example.com", "v1.4.4") is False
    assert auto.maybe_auto_update(None, "https://app.example.com", "v1.4.4") is False
    assert _FakePopen.calls == []


def test_auto_update_skips_unmanaged_install(tmp_path, monkeypatch):
    _arm(tmp_path, monkeypatch, managed=False)
    assert auto.maybe_auto_update("v1.4.5", "https://app.example.com", "v1.4.4") is False
    assert _FakePopen.calls == []
    # The skip is logged so a manual upgrade path is discoverable.
    log = (tmp_path / ".iris" / "auto_update.log").read_text()
    assert "iris upgrade" in log


def test_auto_update_one_attempt_per_day(tmp_path, monkeypatch):
    _arm(tmp_path, monkeypatch)
    assert auto.maybe_auto_update("v1.4.5", "https://app.example.com", "v1.4.4") is True
    # Second call same day is suppressed by the stamp.
    assert auto.maybe_auto_update("v1.4.5", "https://app.example.com", "v1.4.4") is False
    assert len(_FakePopen.calls) == 1


def test_auto_update_env_opt_out(tmp_path, monkeypatch):
    _arm(tmp_path, monkeypatch)
    monkeypatch.setenv(auto.ENV_OPT_OUT, "1")
    assert auto.maybe_auto_update("v1.4.5", "https://app.example.com", "v1.4.4") is False
    assert _FakePopen.calls == []
