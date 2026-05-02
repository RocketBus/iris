"""Iris CLI config — stored in ~/.iris/config.json."""

import json
import os

CONFIG_DIR = os.path.expanduser("~/.iris")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")


def _ensure_dir():
    os.makedirs(CONFIG_DIR, exist_ok=True)


def load_config() -> dict:
    """Load config from ~/.iris/config.json. Returns empty dict if missing."""
    if not os.path.exists(CONFIG_FILE):
        return {}
    with open(CONFIG_FILE) as f:
        return json.load(f)


def save_config(config: dict) -> None:
    """Save config to ~/.iris/config.json."""
    _ensure_dir()
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)
        f.write("\n")


def get_auth() -> tuple[str, str] | None:
    """Return (server_url, token) or None if not configured."""
    config = load_config()
    server = config.get("server_url")
    token = config.get("token")
    if server and token:
        return server, token
    return None


def get_org_slug() -> str | None:
    """Return the configured org slug, or None."""
    return load_config().get("org_slug")


def get_github_user() -> str | None:
    """Return the GitHub username, detecting and caching on first call.

    Priority:
    1. Cached value in config.json
    2. `gh api user -q .login` (GitHub CLI)
    3. `git config user.email` (fallback)
    """
    import subprocess

    config = load_config()

    # Return cached value
    cached = config.get("github_user")
    if cached:
        return cached

    user = None

    # Try GitHub CLI
    try:
        result = subprocess.run(
            ["gh", "api", "user", "-q", ".login"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            user = result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Fallback to git email
    if not user:
        try:
            result = subprocess.run(
                ["git", "config", "user.email"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0 and result.stdout.strip():
                user = result.stdout.strip()
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass

    # Cache for next time
    if user:
        config["github_user"] = user
        save_config(config)

    return user
