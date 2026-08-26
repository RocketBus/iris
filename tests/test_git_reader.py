"""Tests for git_reader — empty-repo handling (issue #184).

Exercises `read_commits()` against real temporary Git repositories (no
mocking of subprocess — the bug was specifically about what real `git`
exit codes/stderr look like).

Runnable as: `python -m pytest tests/test_git_reader.py -v`
"""

import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.ingestion.git_reader import read_commits


def _run(args: list[str], cwd: Path) -> None:
    subprocess.run(args, cwd=cwd, check=True, capture_output=True, text=True)


def _init_empty_repo(path: Path) -> None:
    _run(["git", "init", "-q", "-b", "main"], cwd=path)
    _run(["git", "config", "user.email", "test@example.com"], cwd=path)
    _run(["git", "config", "user.name", "Test"], cwd=path)


def _init_repo_with_commit(path: Path) -> None:
    _init_empty_repo(path)
    (path / "README.md").write_text("hello\n")
    _run(["git", "add", "README.md"], cwd=path)
    _run(["git", "commit", "-q", "-m", "initial commit"], cwd=path)


def test_empty_repo_returns_no_commits(tmp_path):
    # A repo that exists but has never had anything committed to its
    # default branch — `git log` would otherwise fail with exit 128.
    _init_empty_repo(tmp_path)
    assert read_commits(str(tmp_path), days=90) == []


def test_repo_with_commits_still_parses(tmp_path):
    _init_repo_with_commit(tmp_path)
    commits = read_commits(str(tmp_path), days=90)
    assert len(commits) == 1
    assert commits[0].message == "initial commit"


def test_non_repo_directory_raises_with_git_stderr(tmp_path):
    # Exists on disk but was never `git init`-ed — a different failure mode
    # than an empty repo, and must not be swallowed as "zero commits".
    with pytest.raises(RuntimeError) as exc:
        read_commits(str(tmp_path), days=90)
    # The real git stderr must survive, not just the bare exit status.
    assert "not a git repository" in str(exc.value).lower()


def test_nonexistent_path_raises_with_git_stderr(tmp_path):
    missing = tmp_path / "does-not-exist"
    with pytest.raises(RuntimeError) as exc:
        read_commits(str(missing), days=90)
    # The real git stderr must survive, not just the bare exit status.
    assert "no such file or directory" in str(exc.value).lower()
