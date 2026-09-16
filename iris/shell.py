"""Environment for the `git` and `gh` subprocesses the engine shells out to.

Git localizes its messages through `LANG`/`LC_MESSAGES`. On a `pt_BR.UTF-8`
machine, `git -C /missing log` fails with "Arquivo ou diretório inexistente";
on the CI runner it fails with "No such file or directory". Everything the
engine surfaces or matches from git's text — error messages in `RuntimeError`,
tests asserting on them — therefore depended on the machine's locale.

`git_env()` pins the C locale for those subprocesses only, without touching
the user's shell. Structural output (`--porcelain`, `--numstat`, `--pretty`
with separators, `--json`) was already locale-independent; this makes the
human-readable remainder deterministic too.

It is a function, not a module-level constant, so it reflects `os.environ`
at call time (tests monkeypatch it) instead of a snapshot taken at import.
"""

import os


def git_env() -> dict[str, str]:
    """Return the current environment with the locale pinned to C."""
    env = dict(os.environ)
    env["LC_ALL"] = "C"
    env["LANG"] = "C"
    return env
