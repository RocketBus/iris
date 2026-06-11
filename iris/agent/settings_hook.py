"""Register / unregister the Claude Code ``SessionEnd`` hook that feeds the
edge recorder.

``iris agent enable`` adds a SessionEnd entry to the user's
``~/.claude/settings.json`` that runs ``iris agent record``. When a session
ends, Claude Code delivers ``{session_id, transcript_path, cwd, ...}`` on stdin;
``record`` parses the transcript locally and spools anonymous aggregates.

Opt-in is per-developer (it edits the user's own settings) and per-machine. We
touch only our own entry, never other hooks the developer may have configured.
"""

import json
import os
import shutil

from iris.agent.recorder import spool_stats
from iris.platform.config import load_config, save_config

CONFIG_FLAG = "agent_telemetry_enabled"


def _settings_path() -> str:
    return os.path.expanduser("~/.claude/settings.json")


def _record_command() -> str:
    """Absolute ``iris agent record`` command, resolving the iris binary so the
    hook works even when PATH is minimal at session-end time."""
    iris_bin = shutil.which("iris") or "iris"
    return f"{iris_bin} agent record"


def _is_iris_record(command: object) -> bool:
    return (
        isinstance(command, str) and "iris" in command and "agent record" in command
    )


def _load_settings() -> dict:
    path = _settings_path()
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save_settings(settings: dict) -> None:
    path = _settings_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2)
        f.write("\n")


def _session_end_has_iris(settings: dict) -> bool:
    hooks = settings.get("hooks")
    if not isinstance(hooks, dict):
        return False
    for entry in hooks.get("SessionEnd", []) or []:
        if not isinstance(entry, dict):
            continue
        for hook in entry.get("hooks", []) or []:
            if isinstance(hook, dict) and _is_iris_record(hook.get("command")):
                return True
    return False


def enable() -> dict:
    """Register the SessionEnd hook (idempotent). Returns a status dict."""
    settings = _load_settings()
    already = _session_end_has_iris(settings)

    if not already:
        hooks = settings.setdefault("hooks", {})
        if not isinstance(hooks, dict):
            hooks = {}
            settings["hooks"] = hooks
        session_end = hooks.get("SessionEnd")
        if not isinstance(session_end, list):
            session_end = []
            hooks["SessionEnd"] = session_end
        session_end.append(
            {"hooks": [{"type": "command", "command": _record_command()}]}
        )
        _save_settings(settings)

    config = load_config()
    config[CONFIG_FLAG] = True
    save_config(config)

    return {
        "already_enabled": already,
        "settings_path": _settings_path(),
        "command": _record_command(),
    }


def disable() -> dict:
    """Remove the Iris SessionEnd hook entry (idempotent). Returns a status dict."""
    settings = _load_settings()
    removed = False

    hooks = settings.get("hooks")
    if isinstance(hooks, dict) and isinstance(hooks.get("SessionEnd"), list):
        new_entries = []
        for entry in hooks["SessionEnd"]:
            if not isinstance(entry, dict):
                new_entries.append(entry)
                continue
            kept = [
                hook
                for hook in entry.get("hooks", []) or []
                if not (isinstance(hook, dict) and _is_iris_record(hook.get("command")))
            ]
            if len(kept) != len(entry.get("hooks", []) or []):
                removed = True
            if kept:
                entry = {**entry, "hooks": kept}
                new_entries.append(entry)
            # entries left with no hooks are dropped
        if new_entries:
            hooks["SessionEnd"] = new_entries
        else:
            hooks.pop("SessionEnd", None)
        if not hooks:
            settings.pop("hooks", None)
        if removed:
            _save_settings(settings)

    config = load_config()
    if config.get(CONFIG_FLAG):
        config[CONFIG_FLAG] = False
        save_config(config)

    return {"removed": removed, "settings_path": _settings_path()}


def status() -> dict:
    """Return enable state, hook presence, and spool stats."""
    settings = _load_settings()
    return {
        "flag": bool(load_config().get(CONFIG_FLAG)),
        "hook_registered": _session_end_has_iris(settings),
        "settings_path": _settings_path(),
        "spool": spool_stats(),
    }
