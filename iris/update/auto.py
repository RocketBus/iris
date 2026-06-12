"""Default-on, opt-out silent self-update for the Iris CLI.

The update *action* already exists (``iris upgrade`` → ``curl <server>/install.sh
| sh``). This module adds the missing half: knowing a newer version exists and
firing the upgrade quietly, without ever blocking a commit or push.

Consent model mirrors ``iris/agent/settings_hook.py``:
- First run records a decision once (``auto_update_initialized``) and defaults
  the flag ON, after printing a disclosure the user can actually see.
- Opt-out is persistent (``iris upgrade --disable-auto`` → flag False) or
  transient (``IRIS_NO_AUTO_UPDATE=1``, for CI/runners).

Safety guards specific to self-update (vs. read-only telemetry):
- Only fires from the background push path, fully detached, never interactive.
- Only auto-manages installs that ``install.sh`` owns (pipx / ``~/.iris/venv``);
  system pip or Homebrew installs are skipped silently rather than clobbered.
- At most one attempt per day; failures are logged, never raised.
"""

import os
import subprocess
import sys
from datetime import date, datetime

from iris.platform.config import CONFIG_DIR, load_config, save_config

CONFIG_FLAG = "auto_update_enabled"
# Set once a decision exists (auto first-run OR explicit enable/disable). While
# absent, first-run may auto-enable; once set, the stored choice is respected.
CONFIG_INITIALIZED = "auto_update_initialized"

ENV_OPT_OUT = "IRIS_NO_AUTO_UPDATE"

STAMP_FILE = os.path.join(CONFIG_DIR, ".last_auto_update")
LOG_FILE = os.path.join(CONFIG_DIR, "auto_update.log")


# --- preference toggles -----------------------------------------------------


def enable() -> dict:
    """Persist auto-update ON and mark the decision made."""
    config = load_config()
    config[CONFIG_FLAG] = True
    config[CONFIG_INITIALIZED] = True
    save_config(config)
    return {"enabled": True}


def disable() -> dict:
    """Persist auto-update OFF and mark the decision made."""
    config = load_config()
    config[CONFIG_FLAG] = False
    config[CONFIG_INITIALIZED] = True
    save_config(config)
    return {"enabled": False}


def is_enabled() -> bool:
    """Effective state: the transient env opt-out overrides the stored flag."""
    if os.environ.get(ENV_OPT_OUT):
        return False
    return bool(load_config().get(CONFIG_FLAG))


# --- version comparison -----------------------------------------------------


def _parse_version(v: str) -> tuple[int, int, int]:
    """Parse a ``v1.4.4`` / ``1.4.4`` tag into a comparable ``(major, minor,
    patch)`` tuple. Leading ``v`` and any pre-release suffix are ignored; a
    component that can't be read falls back to 0."""
    parts: list[int] = []
    for chunk in v.strip().lstrip("vV").split(".")[:3]:
        digits = ""
        for ch in chunk:
            if ch.isdigit():
                digits += ch
            else:
                break
        parts.append(int(digits) if digits else 0)
    while len(parts) < 3:
        parts.append(0)
    return parts[0], parts[1], parts[2]


def version_is_newer(latest: str | None, current: str) -> bool:
    """True iff ``latest`` is strictly newer than ``current``."""
    if not latest:
        return False
    try:
        return _parse_version(latest) > _parse_version(current)
    except Exception:
        return False


# --- install-type guard -----------------------------------------------------


def _managed_install() -> bool:
    """Whether the running install is one ``install.sh`` knows how to upgrade
    (pipx venv or ``~/.iris/venv``). Anything else (system pip, Homebrew) is
    left alone — piping the installer over it would create a conflicting copy.
    """
    prefix = os.path.realpath(sys.prefix)
    iris_dir = os.path.realpath(os.path.expanduser("~/.iris"))
    if prefix == iris_dir or prefix.startswith(iris_dir + os.sep):
        return True
    # pipx venvs live at <PIPX_HOME>/venvs/iris (default ~/.local/pipx).
    pipx_home = os.environ.get("PIPX_HOME") or os.path.expanduser("~/.local/pipx")
    pipx_iris = os.path.realpath(os.path.join(pipx_home, "venvs", "iris"))
    if prefix == pipx_iris or prefix.startswith(pipx_iris + os.sep):
        return True
    # Fallback heuristic for relocated pipx homes.
    return (os.sep + "pipx" + os.sep) in prefix and prefix.rstrip(os.sep).endswith(
        os.sep + "iris"
    )


# --- daily stamp ------------------------------------------------------------


def _attempted_today() -> bool:
    try:
        with open(STAMP_FILE, encoding="utf-8") as f:
            return f.read().strip() == date.today().isoformat()
    except OSError:
        return False


def _mark_attempt() -> None:
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        with open(STAMP_FILE, "w", encoding="utf-8") as f:
            f.write(date.today().isoformat() + "\n")
    except OSError:
        pass


def _log(message: str) -> None:
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"{datetime.now().isoformat(timespec='seconds')}  {message}\n")
    except OSError:
        pass


# --- the silent update ------------------------------------------------------


def maybe_auto_update(
    latest_version: str | None,
    server_url: str,
    current_version: str,
) -> bool:
    """Best-effort silent upgrade, piggybacking on the daily background push.

    Fires a detached ``curl <server>/install.sh | sh`` and returns immediately;
    the running process is never blocked and the spawned upgrade outlives it.
    Returns True iff an upgrade was launched. Swallows every error — a failed
    self-update must never disrupt the push that triggered it.
    """
    try:
        if not is_enabled():
            return False
        if not version_is_newer(latest_version, current_version):
            return False
        if not _managed_install():
            _log(
                f"skip: {latest_version} available but install at {sys.prefix} "
                "is not pipx/~/.iris — upgrade manually with: iris upgrade"
            )
            return False
        if _attempted_today():
            return False

        # Stamp before launching: a broken release should retry tomorrow, not on
        # every push for the rest of the day.
        _mark_attempt()

        install_url = f"{server_url.rstrip('/')}/install.sh"
        _log(f"launching upgrade {current_version} -> {latest_version} via {install_url}")

        log_fh = open(LOG_FILE, "a", encoding="utf-8")  # noqa: SIM115 — held by child
        subprocess.Popen(
            ["sh", "-c", f"curl -fsSL '{install_url}' | sh"],
            stdin=subprocess.DEVNULL,
            stdout=log_fh,
            stderr=subprocess.STDOUT,
            start_new_session=True,  # detach: survives the parent push exiting
        )
        return True
    except Exception:
        return False
