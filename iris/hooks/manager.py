"""Hook manager — install, uninstall, verify, and repair Iris git hooks.

Git executes exactly one file per hook: ``$(git rev-parse --git-path hooks)/<hook>``.
Every hook-binding library — husky, lefthook, pre-commit, simple-git-hooks,
overcommit — has to pass through that file, and each fills it differently:
husky sources a runner that ends in ``exit``, lefthook and pre-commit ``exec``
their own binary, simple-git-hooks writes commands inline, overcommit symlinks
every hook to one shared runner.

None of those shapes can shadow the *second line* of the file. So Iris claims
that line instead of appending to the end, and the install works the same way
for every library without naming any of them:

1. ``resolve_hooks_dir`` asks git where the slot is, rather than parsing config.
2. ``_inject`` writes a loader at line 2, above whatever is already there.
3. The loader delegates to a payload versioned inside Iris, so upgrading Iris
   never means re-installing across repos.
4. ``probe_reachable`` proves the section runs by executing it.
5. ``heal`` re-injects when a library regenerates its hook file and wipes us.

Attribution itself is non-destructive: no history rewriting, no amend, no hash
changes. If a hook fails for any reason, the commit proceeds normally.
"""

import os
import shutil
import stat
import subprocess
import tempfile

HOOK_NAME = "prepare-commit-msg"
POST_COMMIT_HOOK_NAME = "post-commit"

LEGACY_HOOK_NAME = "post-commit"

HOOK_MARKER_START = "# >>> iris-hook-start >>>"
HOOK_MARKER_END = "# <<< iris-hook-end <<<"

PUSH_MARKER_START = "# >>> iris-push-start >>>"
PUSH_MARKER_END = "# <<< iris-push-end <<<"

_MARKERS = {
    HOOK_NAME: (HOOK_MARKER_START, HOOK_MARKER_END),
    POST_COMMIT_HOOK_NAME: (PUSH_MARKER_START, PUSH_MARKER_END),
}

_PAYLOAD_SOURCES = {
    HOOK_NAME: "prepare_commit_msg.sh",
    POST_COMMIT_HOOK_NAME: "post_commit_push.sh",
}

_PROBE_ENV_VAR = "IRIS_HOOK_PROBE"

_PROBE_TIMEOUT_SECONDS = 15

_ORIGINAL_LINK_DIR = ".iris-original"

_EXEC_BITS = stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH


def iris_home() -> str:
    """Directory Iris owns on this machine. ``IRIS_HOME`` overrides it."""
    return os.environ.get("IRIS_HOME") or os.path.join(os.path.expanduser("~"), ".iris")


def payload_dir() -> str:
    """Directory holding the deployed hook payloads."""
    return os.path.join(iris_home(), "hooks")


def payload_path(hook_name: str) -> str:
    """Path the injected loader delegates to for ``hook_name``."""
    return os.path.join(payload_dir(), hook_name)


def _packaged_payload(hook_name: str) -> str:
    """Read the payload script shipped inside the Iris package."""
    source = os.path.join(os.path.dirname(__file__), _PAYLOAD_SOURCES[hook_name])
    with open(source) as f:
        return f.read()


def get_hook_script() -> str:
    """Read the prepare-commit-msg payload template."""
    return _packaged_payload(HOOK_NAME)


def get_push_hook_script() -> str:
    """Read the post-commit payload template."""
    return _packaged_payload(POST_COMMIT_HOOK_NAME)


def deploy_payloads() -> list[str]:
    """Write the packaged payload scripts into ``payload_dir()``.

    Returns the hook names whose deployed copy differed from the packaged one
    and was refreshed. Idempotent: an up-to-date copy is left untouched, so
    this is cheap enough to call on every install and every heal.
    """
    os.makedirs(payload_dir(), exist_ok=True)
    refreshed = []

    for hook_name in _PAYLOAD_SOURCES:
        wanted = _packaged_payload(hook_name)
        target = payload_path(hook_name)

        current = None
        if os.path.isfile(target):
            with open(target) as f:
                current = f.read()

        if current != wanted:
            with open(target, "w") as f:
                f.write(wanted)
            refreshed.append(hook_name)

        st = os.stat(target)
        if not st.st_mode & stat.S_IEXEC:
            os.chmod(target, st.st_mode | _EXEC_BITS)

    return refreshed


def _git(repo_path: str, *args: str) -> str | None:
    """Run git in ``repo_path`` and return trimmed stdout, or None on failure."""
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=_PROBE_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.SubprocessError):
        return None

    if result.returncode != 0:
        return None

    return result.stdout.strip() or None


def resolve_git_dir(repo_path: str) -> str | None:
    """Absolute git directory for ``repo_path``, or None if not a repository.

    Asking git covers the cases a ``.git`` directory check misses: linked
    worktrees and submodules, where ``.git`` is a file.
    """
    git_dir = _git(repo_path, "rev-parse", "--git-dir")
    if git_dir is None:
        return None

    return os.path.abspath(os.path.join(repo_path, git_dir))


def resolve_hooks_dir(repo_path: str) -> str | None:
    """Absolute directory git will invoke hooks from, or None if not a repo.

    ``git rev-parse --git-path hooks`` is the authoritative answer: it honours
    ``core.hooksPath`` at every config level — local, global, system, and
    anything pulled in by ``include``/``includeIf`` — and resolves correctly
    inside worktrees and submodules.
    """
    hooks_dir = _git(repo_path, "rev-parse", "--git-path", "hooks")
    if hooks_dir is None:
        return None

    return os.path.abspath(os.path.join(repo_path, os.path.expanduser(hooks_dir)))


def _require_hooks_dir(repo_path: str) -> str:
    """Resolve the hooks directory or raise, for the install entry points."""
    hooks_dir = resolve_hooks_dir(repo_path)
    if hooks_dir is None:
        raise FileNotFoundError(f"Not a git repository: {repo_path}")

    return hooks_dir


def get_hooks_dir(repo_path: str) -> str:
    """Hooks directory for ``repo_path``, falling back to ``.git/hooks``.

    The fallback keeps callers that only want a path from having to handle
    None; the install path uses ``_require_hooks_dir`` instead so a
    non-repository fails loudly.
    """
    return resolve_hooks_dir(repo_path) or os.path.join(repo_path, ".git", "hooks")


def _loader_section(hook_name: str) -> str:
    """Build the shell snippet injected into a repository's hook file.

    Every command sits in an ``if`` condition or is followed by ``|| true``:
    a library may run this file under ``sh -e``, where a bare non-zero
    top-level command would abort the hook — and aborting prepare-commit-msg
    aborts the commit.

    The probe branch answers ``probe_reachable`` and exits immediately, so
    verifying reachability never reaches the hook code below and cannot
    trigger its side effects.
    """
    start, end = _MARKERS[hook_name]
    payload = f'"${{IRIS_HOME:-$HOME/.iris}}/hooks/{hook_name}"'

    return "\n".join(
        [
            start,
            f'if [ -n "${_PROBE_ENV_VAR}" ]; then printf reached > "${_PROBE_ENV_VAR}"; exit 0; fi',
            f"IRIS_HOOK_PAYLOAD={payload}",
            'if [ -x "$IRIS_HOOK_PAYLOAD" ]; then "$IRIS_HOOK_PAYLOAD" "$@" || true; fi',
            "unset IRIS_HOOK_PAYLOAD",
            end,
        ]
    )


def _read(path: str) -> str:
    with open(path) as f:
        return f.read()


def _has_section(path: str, hook_name: str) -> bool:
    """Whether ``path`` carries the Iris section for ``hook_name``."""
    if not os.path.isfile(path):
        return False

    return _MARKERS[hook_name][0] in _read(path)


def _make_executable(path: str) -> None:
    st = os.stat(path)
    os.chmod(path, st.st_mode | _EXEC_BITS)


def _replace_symlink(hook_file: str, hook_name: str) -> str:
    """Turn a symlinked hook into a real file that tail-calls the original.

    Writing through the symlink would edit the target, which libraries like
    overcommit share across every hook — one install would contaminate all of
    them. Instead the link is moved into a private directory under its own
    name and exec'd from there, so a runner that dispatches on
    ``basename "$0"`` still sees the hook it was invoked as.
    """
    link_dir = os.path.join(os.path.dirname(hook_file), _ORIGINAL_LINK_DIR)
    os.makedirs(link_dir, exist_ok=True)

    preserved = os.path.join(link_dir, hook_name)
    target = os.readlink(hook_file)
    if not os.path.isabs(target):
        target = os.path.join(os.path.dirname(hook_file), target)

    if os.path.lexists(preserved):
        os.remove(preserved)
    os.symlink(os.path.realpath(target), preserved)

    os.remove(hook_file)
    with open(hook_file, "w") as f:
        f.write(f'#!/bin/sh\n{_loader_section(hook_name)}\nexec "{preserved}" "$@"\n')

    _make_executable(hook_file)
    return hook_file


def _inject(hook_file: str, hook_name: str) -> str:
    """Write the Iris loader at the top of ``hook_file``, creating it if absent.

    The section goes immediately after the shebang — the one position no
    ``exit``, ``exec``, sourced runner, or errexit further down can shadow.
    """
    section = _loader_section(hook_name)

    if os.path.islink(hook_file):
        return _replace_symlink(hook_file, hook_name)

    if not os.path.isfile(hook_file):
        with open(hook_file, "w") as f:
            f.write(f"#!/bin/sh\n{section}\n")
        _make_executable(hook_file)
        return hook_file

    lines = _read(hook_file).split("\n")
    at = 1 if lines and lines[0].startswith("#!") else 0
    with open(hook_file, "w") as f:
        f.write("\n".join(lines[:at] + section.split("\n") + lines[at:]))

    _make_executable(hook_file)
    return hook_file


def probe_reachable(repo_path: str, hook_name: str) -> bool:
    """Execute the repository's hook and report whether the Iris section ran.

    Reachability is measured, not inferred from the shape of the directory or
    the library that owns it. The hook file is executed directly so its
    shebang is honoured, exactly as git would.

    Returns False when the file is missing, carries no Iris section, fails to
    execute, or runs without reaching the section.
    """
    hooks_dir = resolve_hooks_dir(repo_path)
    if hooks_dir is None:
        return False

    hook_file = os.path.join(hooks_dir, hook_name)
    if not _has_section(hook_file, hook_name):
        return False

    if not os.access(hook_file, os.X_OK):
        return False

    workspace = tempfile.mkdtemp(prefix="iris-probe-")
    witness = os.path.join(workspace, "witness")
    message_file = os.path.join(workspace, "COMMIT_EDITMSG")

    with open(message_file, "w") as f:
        f.write("iris hook reachability probe\n")

    args = [message_file, "message"] if hook_name == HOOK_NAME else []
    env = dict(os.environ, **{_PROBE_ENV_VAR: witness})

    try:
        subprocess.run(
            [hook_file, *args],
            cwd=repo_path,
            env=env,
            capture_output=True,
            timeout=_PROBE_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    finally:
        reached = os.path.isfile(witness) and os.path.getsize(witness) > 0
        shutil.rmtree(workspace, ignore_errors=True)

    return reached


def _stale_locations(repo_path: str) -> list[str]:
    """Directories where an earlier install may have left an unreachable section.

    Only the directory git resolves to is invoked, so an Iris section anywhere
    else is dead by construction. Two places can hold one: ``<git-dir>/hooks``
    from before ``core.hooksPath`` was set, and the parent of the resolved
    directory, which earlier Iris versions preferred when a library delegated
    across two levels.
    """
    hooks_dir = resolve_hooks_dir(repo_path)
    if hooks_dir is None:
        return []

    candidates = [os.path.dirname(hooks_dir)]
    git_dir = resolve_git_dir(repo_path)
    if git_dir is not None:
        candidates.append(os.path.join(git_dir, "hooks"))

    seen = set()
    locations = []
    for candidate in candidates:
        normalised = os.path.normpath(candidate)
        if normalised == hooks_dir or normalised in seen:
            continue
        seen.add(normalised)
        if os.path.isdir(normalised):
            locations.append(normalised)

    return locations


def find_stale_sections(repo_path: str) -> list[str]:
    """Hook files holding an Iris section git will never invoke."""
    stale = []
    for location in _stale_locations(repo_path):
        for hook_name in _MARKERS:
            path = os.path.join(location, hook_name)
            if _has_section(path, hook_name):
                stale.append(path)

    return stale


def purge_stale_sections(repo_path: str) -> list[str]:
    """Strip Iris sections from every location git does not invoke.

    Only the marked section is removed; the rest of the file belongs to
    whoever wrote it. Returns the paths that were cleaned.
    """
    cleaned = []
    for path in find_stale_sections(repo_path):
        for hook_name, (start, end) in _MARKERS.items():
            content = _read(path) if os.path.isfile(path) else ""
            if start in content:
                _remove_marked_section_custom(path, content, start, end)
        cleaned.append(path)

    return cleaned


def _registry_path() -> str:
    return os.path.join(iris_home(), "installed-repos")


def registered_repos() -> list[str]:
    """Repositories where ``iris hook install`` has run on this machine."""
    path = _registry_path()
    if not os.path.isfile(path):
        return []

    with open(path) as f:
        return [line.strip() for line in f if line.strip()]


def _register(repo_path: str) -> None:
    """Record a repository so ``heal`` knows it is meant to have hooks."""
    resolved = os.path.abspath(repo_path)
    repos = registered_repos()
    if resolved in repos:
        return

    os.makedirs(iris_home(), exist_ok=True)
    with open(_registry_path(), "w") as f:
        f.write("\n".join([*repos, resolved]) + "\n")


def _unregister(repo_path: str) -> None:
    resolved = os.path.abspath(repo_path)
    repos = [r for r in registered_repos() if r != resolved]

    path = _registry_path()
    if not repos:
        if os.path.isfile(path):
            os.remove(path)
        return

    os.makedirs(iris_home(), exist_ok=True)
    with open(path, "w") as f:
        f.write("\n".join(repos) + "\n")


def is_installed(repo_path: str) -> bool:
    """Whether the attribution hook is present and reachable."""
    return probe_reachable(repo_path, HOOK_NAME)


def _install_hook(repo_path: str, hook_name: str) -> str:
    """Deploy the payload and inject the loader for one hook.

    Raises:
        FileExistsError: the section is already present and reachable.
        FileNotFoundError: ``repo_path`` is not a git repository.
    """
    hooks_dir = _require_hooks_dir(repo_path)

    deploy_payloads()
    purge_stale_sections(repo_path)

    hook_file = os.path.join(hooks_dir, hook_name)

    if _has_section(hook_file, hook_name):
        if probe_reachable(repo_path, hook_name):
            _register(repo_path)
            raise FileExistsError(f"Iris {hook_name} hook is already installed.")
        content = _read(hook_file)
        start, end = _MARKERS[hook_name]
        _remove_marked_section_custom(hook_file, content, start, end)

    os.makedirs(hooks_dir, exist_ok=True)
    _inject(hook_file, hook_name)
    _register(repo_path)

    return hook_file


def install(repo_path: str) -> str:
    """Install the attribution hook.

    Args:
        repo_path: Path to a git repository, worktree, or submodule.

    Returns:
        Path to the hook file git will invoke.
    """
    hooks_dir = _require_hooks_dir(repo_path)

    legacy_file = os.path.join(hooks_dir, LEGACY_HOOK_NAME)
    if _has_section(legacy_file, HOOK_NAME):
        _remove_marked_section(legacy_file, _read(legacy_file))

    return _install_hook(repo_path, HOOK_NAME)


def install_push_hook(repo_path: str) -> str:
    """Install the post-commit hook that pushes a daily report."""
    return _install_hook(repo_path, POST_COMMIT_HOOK_NAME)


def _restore_symlink(hooks_dir: str, hook_name: str) -> bool:
    """Put back the symlink that ``_replace_symlink`` stood in for.

    Uninstalling has to undo the wrapper as a whole, not just strip the Iris
    section from it — otherwise the repository is left with a file that only
    exists because Iris was once installed.
    """
    preserved = os.path.join(hooks_dir, _ORIGINAL_LINK_DIR, hook_name)
    if not os.path.islink(preserved):
        return False

    hook_file = os.path.join(hooks_dir, hook_name)
    if os.path.isfile(hook_file) and preserved not in _read(hook_file):
        return False

    target = os.readlink(preserved)
    if os.path.lexists(hook_file):
        os.remove(hook_file)
    os.symlink(target, hook_file)
    os.remove(preserved)

    link_dir = os.path.dirname(preserved)
    if not os.listdir(link_dir):
        os.rmdir(link_dir)

    return True


def _uninstall_hook(repo_path: str, hook_name: str, extra_names: tuple[str, ...] = ()) -> bool:
    hooks_dir = resolve_hooks_dir(repo_path)
    if hooks_dir is None:
        return False

    start, end = _MARKERS[hook_name]
    removed = _restore_symlink(hooks_dir, hook_name)

    for name in (hook_name, *extra_names):
        hook_file = os.path.join(hooks_dir, name)
        if not os.path.isfile(hook_file):
            continue
        content = _read(hook_file)
        if start in content:
            _remove_marked_section_custom(hook_file, content, start, end)
            removed = True

    return removed


def uninstall(repo_path: str) -> bool:
    """Remove the attribution hook section, keeping the rest of the file."""
    removed = bool(purge_stale_sections(repo_path))
    removed |= _uninstall_hook(repo_path, HOOK_NAME, (LEGACY_HOOK_NAME,))

    if removed and not _has_section(
        os.path.join(get_hooks_dir(repo_path), POST_COMMIT_HOOK_NAME), POST_COMMIT_HOOK_NAME
    ):
        _unregister(repo_path)

    return removed


def uninstall_push_hook(repo_path: str) -> bool:
    """Remove the post-commit hook section."""
    removed = _uninstall_hook(repo_path, POST_COMMIT_HOOK_NAME)

    if removed and not _has_section(
        os.path.join(get_hooks_dir(repo_path), HOOK_NAME), HOOK_NAME
    ):
        _unregister(repo_path)

    return removed


def status(repo_path: str) -> dict:
    """Report what is installed and whether it can actually run.

    ``installed`` is answered by executing the hook, not by finding a marker:
    a section a library has stranded below its own ``exit`` reports as *not*
    installed, with its path under ``unreachable_sections``.

    Returns:
        Dict with keys: installed, hook_type, hook_path, hooks_dir,
        payload_deployed, unreachable_sections, stale_sections.
    """
    hooks_dir = get_hooks_dir(repo_path)
    unreachable = []

    for hook_name in _MARKERS:
        hook_file = os.path.join(hooks_dir, hook_name)
        if _has_section(hook_file, hook_name) and not probe_reachable(repo_path, hook_name):
            unreachable.append(hook_file)

    base = {
        "hooks_dir": hooks_dir,
        "payload_deployed": os.path.isfile(payload_path(HOOK_NAME)),
        "unreachable_sections": unreachable,
        "stale_sections": find_stale_sections(repo_path),
    }

    if probe_reachable(repo_path, HOOK_NAME):
        return {
            **base,
            "installed": True,
            "hook_type": HOOK_NAME,
            "hook_path": os.path.join(hooks_dir, HOOK_NAME),
        }

    legacy_file = os.path.join(hooks_dir, LEGACY_HOOK_NAME)
    if _has_section(legacy_file, HOOK_NAME):
        return {
            **base,
            "installed": False,
            "hook_type": LEGACY_HOOK_NAME + " (legacy — run install to migrate)",
            "hook_path": legacy_file,
        }

    return {
        **base,
        "installed": False,
        "hook_type": None,
        "hook_path": None,
    }


def heal(repo_path: str) -> list[str]:
    """Re-install hooks a library regenerated away, for a registered repository.

    Libraries rewrite their generated hook file on every install — ``husky``
    on each ``npm install``, ``pre-commit install``, ``lefthook install`` —
    taking the Iris section with it. Ownership is not winnable, so repair is
    automatic instead: this restores anything missing or unreachable and is
    silent when there is nothing to do.

    Only repositories that went through ``install`` are touched. Returns the
    hook names that were repaired.

    ``repo_path`` may be any directory inside the repository: the worktree root
    is resolved first, so an ``iris`` invocation from a subdirectory still
    matches what ``install`` registered.
    """
    registered = registered_repos()
    if not registered:
        return []

    resolved = os.path.abspath(repo_path)
    if resolved not in registered:
        top_level = _git(resolved, "rev-parse", "--show-toplevel")
        if top_level is None:
            return []
        resolved = os.path.abspath(top_level)
        if resolved not in registered:
            return []

    if resolve_hooks_dir(resolved) is None:
        return []

    deploy_payloads()

    repaired = []
    for hook_name in _MARKERS:
        if probe_reachable(resolved, hook_name):
            continue
        try:
            _install_hook(resolved, hook_name)
        except (FileExistsError, FileNotFoundError, OSError):
            continue
        repaired.append(hook_name)

    return repaired


def _remove_marked_section_custom(hook_file: str, content: str, start_marker: str, end_marker: str) -> None:
    """Remove a marked section, deleting the file if nothing meaningful remains.

    The newline *before* the section is left in place: the section now sits
    directly under the shebang, and consuming that newline would glue the
    shebang to the first line of the library's own hook. A legacy appended
    section leaves one blank line behind instead, which changes nothing.
    """
    start_idx = content.find(start_marker)
    end_idx = content.find(end_marker)
    if start_idx == -1 or end_idx == -1:
        return

    end_idx = content.find("\n", end_idx) + 1
    if end_idx == 0:
        end_idx = len(content)

    cleaned = content[:start_idx] + content[end_idx:]

    if cleaned.strip() in ("#!/bin/sh", "#!/bin/bash", "#!/usr/bin/env sh", "#!/usr/bin/env bash", ""):
        os.remove(hook_file)
    else:
        with open(hook_file, "w") as f:
            f.write(cleaned)


def _remove_marked_section(hook_file: str, content: str) -> None:
    """Remove the attribution section from a hook file."""
    _remove_marked_section_custom(hook_file, content, HOOK_MARKER_START, HOOK_MARKER_END)
