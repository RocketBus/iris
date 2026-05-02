"""Hook manager — install, uninstall, and check status of Iris git hooks.

The prepare-commit-msg hook detects AI agent env vars ($AI_AGENT,
$CLAUDE_CODE, $CURSOR_SESSION, $WINDSURF_SESSION) and appends a
Co-Authored-By tag to the commit message before the commit is created.

This is non-destructive: no history rewriting, no amend, no hash changes.
If the hook fails for any reason, the commit proceeds normally.

Compatible with pre-commit frameworks (husky, lefthook) by appending
to existing hooks rather than overwriting them.
"""

import os
import stat

# Hook filename in .git/hooks/
HOOK_NAME = "prepare-commit-msg"
POST_COMMIT_HOOK_NAME = "post-commit"

# Legacy hook to clean up on install
LEGACY_HOOK_NAME = "post-commit"

# Marker used to identify Iris hook sections in existing hook files.
HOOK_MARKER_START = "# >>> iris-hook-start >>>"
HOOK_MARKER_END = "# <<< iris-hook-end <<<"

PUSH_MARKER_START = "# >>> iris-push-start >>>"
PUSH_MARKER_END = "# <<< iris-push-end <<<"


def get_hook_script() -> str:
    """Read the prepare-commit-msg hook script template."""
    hook_path = os.path.join(os.path.dirname(__file__), "prepare_commit_msg.sh")
    with open(hook_path) as f:
        return f.read()


def get_push_hook_script() -> str:
    """Read the post-commit push hook script template."""
    hook_path = os.path.join(os.path.dirname(__file__), "post_commit_push.sh")
    with open(hook_path) as f:
        return f.read()


def get_hooks_dir(repo_path: str) -> str:
    """Get the git hooks directory for a repository."""
    hooks_path_file = os.path.join(repo_path, ".git", "hooks")

    # Check for custom hooks path via git config
    config_path = os.path.join(repo_path, ".git", "config")
    if os.path.isfile(config_path):
        with open(config_path) as f:
            for line in f:
                if "hooksPath" in line and "=" in line:
                    custom = line.split("=", 1)[1].strip()
                    if custom:
                        if not os.path.isabs(custom):
                            custom = os.path.join(repo_path, custom)
                        return custom

    return hooks_path_file


def is_installed(repo_path: str) -> bool:
    """Check if the Iris hook is installed."""
    hooks_dir = get_hooks_dir(repo_path)

    # Check current hook
    hook_file = os.path.join(hooks_dir, HOOK_NAME)
    if os.path.isfile(hook_file):
        with open(hook_file) as f:
            if HOOK_MARKER_START in f.read():
                return True

    # Check legacy hook
    legacy_file = os.path.join(hooks_dir, LEGACY_HOOK_NAME)
    if os.path.isfile(legacy_file):
        with open(legacy_file) as f:
            if HOOK_MARKER_START in f.read():
                return True

    return False


def install(repo_path: str) -> str:
    """Install the Iris prepare-commit-msg hook.

    If a legacy post-commit hook exists, migrates it automatically.
    If a prepare-commit-msg hook already exists, appends the Iris section.
    If no hook exists, creates a new one.

    Args:
        repo_path: Absolute path to a Git repository.

    Returns:
        Path to the installed hook file.

    Raises:
        FileExistsError: If Iris hook is already installed (current version).
        FileNotFoundError: If repo_path is not a git repository.
    """
    if not os.path.isdir(os.path.join(repo_path, ".git")):
        raise FileNotFoundError(f"Not a git repository: {repo_path}")

    hooks_dir = get_hooks_dir(repo_path)

    # Migrate legacy post-commit hook if present
    legacy_file = os.path.join(hooks_dir, LEGACY_HOOK_NAME)
    if os.path.isfile(legacy_file):
        with open(legacy_file) as f:
            content = f.read()
        if HOOK_MARKER_START in content:
            _remove_marked_section(legacy_file, content)

    # Check if current version already installed
    hook_file = os.path.join(hooks_dir, HOOK_NAME)
    if os.path.isfile(hook_file) and not os.path.islink(hook_file):
        with open(hook_file) as f:
            if HOOK_MARKER_START in f.read():
                raise FileExistsError("Iris hook is already installed.")

    os.makedirs(hooks_dir, exist_ok=True)

    hook_script = get_hook_script()
    wrapped = f"\n{HOOK_MARKER_START}\n{hook_script}\n{HOOK_MARKER_END}\n"

    if os.path.islink(hook_file):
        # Replace symlink with a wrapper that calls the original + Iris
        original_target = os.path.realpath(hook_file)
        os.remove(hook_file)
        with open(hook_file, "w") as f:
            f.write(f'#!/bin/sh\n# Wrapper: calls original hook then Iris\n"{original_target}" "$@" 2>/dev/null\n{wrapped}')
    elif os.path.isfile(hook_file):
        with open(hook_file, "a") as f:
            f.write(wrapped)
    else:
        with open(hook_file, "w") as f:
            f.write(f"#!/bin/sh\n{wrapped}")

    # Ensure executable
    st = os.stat(hook_file)
    os.chmod(hook_file, st.st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)

    return hook_file


def uninstall(repo_path: str) -> bool:
    """Remove the Iris hook section.

    Checks both prepare-commit-msg and legacy post-commit.
    Removes only the Iris-marked section, preserving other hook content.

    Args:
        repo_path: Absolute path to a Git repository.

    Returns:
        True if a hook was removed, False if none was installed.
    """
    hooks_dir = get_hooks_dir(repo_path)
    removed = False

    for name in [HOOK_NAME, LEGACY_HOOK_NAME]:
        hook_file = os.path.join(hooks_dir, name)
        if not os.path.isfile(hook_file):
            continue
        with open(hook_file) as f:
            content = f.read()
        if HOOK_MARKER_START in content:
            _remove_marked_section(hook_file, content)
            removed = True

    return removed


def status(repo_path: str) -> dict:
    """Get hook installation status.

    Returns:
        Dict with keys: installed, hook_type, hook_path, hooks_dir.
    """
    hooks_dir = get_hooks_dir(repo_path)

    # Check current hook
    hook_file = os.path.join(hooks_dir, HOOK_NAME)
    if os.path.isfile(hook_file):
        with open(hook_file) as f:
            if HOOK_MARKER_START in f.read():
                return {
                    "installed": True,
                    "hook_type": HOOK_NAME,
                    "hook_path": hook_file,
                    "hooks_dir": hooks_dir,
                }

    # Check legacy hook
    legacy_file = os.path.join(hooks_dir, LEGACY_HOOK_NAME)
    if os.path.isfile(legacy_file):
        with open(legacy_file) as f:
            if HOOK_MARKER_START in f.read():
                return {
                    "installed": True,
                    "hook_type": LEGACY_HOOK_NAME + " (legacy — run install to migrate)",
                    "hook_path": legacy_file,
                    "hooks_dir": hooks_dir,
                }

    return {
        "installed": False,
        "hook_type": None,
        "hook_path": None,
        "hooks_dir": hooks_dir,
    }


def install_push_hook(repo_path: str) -> str:
    """Install the Iris post-commit auto-push hook.

    Pushes analysis to platform once per day (on first commit of the day).
    Runs in background so it doesn't block commits.

    Args:
        repo_path: Absolute path to a Git repository.

    Returns:
        Path to the installed hook file.
    """
    if not os.path.isdir(os.path.join(repo_path, ".git")):
        raise FileNotFoundError(f"Not a git repository: {repo_path}")

    hooks_dir = get_hooks_dir(repo_path)
    hook_file = os.path.join(hooks_dir, POST_COMMIT_HOOK_NAME)

    # Check if already installed
    if os.path.isfile(hook_file):
        with open(hook_file) as f:
            if PUSH_MARKER_START in f.read():
                raise FileExistsError("Iris push hook is already installed.")

    os.makedirs(hooks_dir, exist_ok=True)

    push_script = get_push_hook_script()
    wrapped = f"\n{PUSH_MARKER_START}\n{push_script}\n{PUSH_MARKER_END}\n"

    if os.path.isfile(hook_file):
        with open(hook_file, "a") as f:
            f.write(wrapped)
    else:
        with open(hook_file, "w") as f:
            f.write(f"#!/bin/sh\n{wrapped}")

    st = os.stat(hook_file)
    os.chmod(hook_file, st.st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)

    return hook_file


def uninstall_push_hook(repo_path: str) -> bool:
    """Remove the Iris push hook section."""
    hooks_dir = get_hooks_dir(repo_path)
    hook_file = os.path.join(hooks_dir, POST_COMMIT_HOOK_NAME)

    if not os.path.isfile(hook_file):
        return False

    with open(hook_file) as f:
        content = f.read()

    if PUSH_MARKER_START not in content:
        return False

    _remove_marked_section_custom(hook_file, content, PUSH_MARKER_START, PUSH_MARKER_END)
    return True


def _remove_marked_section_custom(hook_file: str, content: str, start_marker: str, end_marker: str) -> None:
    """Remove a marked section from a hook file."""
    start_idx = content.find(start_marker)
    end_idx = content.find(end_marker)
    if start_idx == -1 or end_idx == -1:
        return

    end_idx = content.find("\n", end_idx) + 1
    if start_idx > 0 and content[start_idx - 1] == "\n":
        start_idx -= 1

    cleaned = content[:start_idx] + content[end_idx:]

    if cleaned.strip() in ("#!/bin/sh", "#!/bin/bash", ""):
        os.remove(hook_file)
    else:
        with open(hook_file, "w") as f:
            f.write(cleaned)


def _remove_marked_section(hook_file: str, content: str) -> None:
    """Remove the Iris-marked section from a hook file."""
    start_idx = content.find(HOOK_MARKER_START)
    end_idx = content.find(HOOK_MARKER_END)
    if start_idx == -1 or end_idx == -1:
        return

    end_idx = content.find("\n", end_idx) + 1
    if start_idx > 0 and content[start_idx - 1] == "\n":
        start_idx -= 1

    cleaned = content[:start_idx] + content[end_idx:]

    if cleaned.strip() in ("#!/bin/sh", "#!/bin/bash", ""):
        os.remove(hook_file)
    else:
        with open(hook_file, "w") as f:
            f.write(cleaned)
