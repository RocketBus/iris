"""Locale-independence of the git/gh subprocesses.

Two guards: the runtime one proves git's error text reaches the caller in
English even when the process runs under a Portuguese locale; the static one
keeps every future `git`/`gh` `subprocess.run` on the pinned environment.

Runnable as a plain script: `python tests/test_subprocess_locale.py`.
"""

import os
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.ingestion.git_reader import read_commits
from iris.shell import git_env

_ROOT = Path(__file__).resolve().parent.parent / "iris"

# A `subprocess.run(` whose argv literal starts with "git" or "gh". User-supplied
# commands (external_reader) and non-git tools (curl in the self-updater) are
# deliberately outside this rule.
_GIT_CALL = re.compile(
    r"subprocess\.run\((?P<body>.*?)\n\s*\)", re.DOTALL,
)
_STARTS_WITH_GIT = re.compile(r"""\[\s*["'](?:git|gh)["']""")


def test_git_env_pins_c_locale_and_keeps_the_rest(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LANG", "pt_BR.UTF-8")
    monkeypatch.setenv("LC_ALL", "pt_BR.UTF-8")
    monkeypatch.setenv("IRIS_PROBE", "kept")
    env = git_env()
    assert env["LC_ALL"] == "C"
    assert env["LANG"] == "C"
    assert env["IRIS_PROBE"] == "kept"
    # Never mutates the caller's environment.
    assert os.environ["LC_ALL"] == "pt_BR.UTF-8"


def test_git_error_text_is_english_under_portuguese_locale(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Regression for the case that failed on pt_BR machines while passing in
    # CI: the message git prints for a missing path.
    monkeypatch.setenv("LANG", "pt_BR.UTF-8")
    monkeypatch.setenv("LC_ALL", "pt_BR.UTF-8")
    monkeypatch.setenv("LC_MESSAGES", "pt_BR.UTF-8")
    with pytest.raises(RuntimeError) as exc:
        read_commits(str(tmp_path / "does-not-exist"), days=90)
    assert "no such file or directory" in str(exc.value).lower()


def test_every_git_or_gh_subprocess_passes_the_pinned_env() -> None:
    offenders: list[str] = []
    for path in sorted(_ROOT.rglob("*.py")):
        text = path.read_text()
        for m in _GIT_CALL.finditer(text):
            body = m.group("body")
            if not _STARTS_WITH_GIT.search(body):
                continue
            if "env=" not in body:
                line = text.count("\n", 0, m.start()) + 1
                offenders.append(f"{path.relative_to(_ROOT.parent)}:{line}")
    assert not offenders, "git/gh subprocess.run without env=git_env(): " + ", ".join(offenders)


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-q"]))
