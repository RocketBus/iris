"""Tests for repository kind classification.

Builds throwaway Git repos on disk, since the classifier reads `git ls-files`.

Runnable as a plain script: `python tests/test_repo_kind.py`.
No external test framework required.
"""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

# Allow running from repo root without installation.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.analysis.repo_kind import RepoKind, classify_repo_kind


def _repo(files: list[str]) -> str:
    """Create a temp Git repo tracking the given paths. Returns its path."""
    path = tempfile.mkdtemp()
    subprocess.run(["git", "init", "-q", path], check=True)
    for rel in files:
        full = os.path.join(path, rel)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w") as fh:
            fh.write("x\n")
    subprocess.run(["git", "-C", path, "add", "-A"], check=True,
                   capture_output=True)
    return path


def test_docs_only_repo_is_non_code() -> None:
    # The shape of an issue-board repo: markdown, images, issue templates.
    repo = _repo([
        "README.md",
        "docs/roadmap.md",
        "docs/diagram.png",
        ".github/ISSUE_TEMPLATE/bug.yml",
    ])
    assert classify_repo_kind(repo) is RepoKind.NON_CODE


def test_node_repo_is_code() -> None:
    repo = _repo(["package.json", "src/index.ts", "README.md"])
    assert classify_repo_kind(repo) is RepoKind.CODE


def test_maven_repo_is_code() -> None:
    repo = _repo(["pom.xml", "src/main/java/App.java"])
    assert classify_repo_kind(repo) is RepoKind.CODE


def test_nested_manifest_is_code() -> None:
    # Monorepos keep manifests below the root.
    repo = _repo(["README.md", "services/api/go.mod", "services/api/main.go"])
    assert classify_repo_kind(repo) is RepoKind.CODE


def test_suffix_manifest_is_code() -> None:
    repo = _repo(["README.md", "src/App.csproj"])
    assert classify_repo_kind(repo) is RepoKind.CODE


def test_deploy_only_repo_is_code() -> None:
    # Nothing compiles here, but something is deployed from it.
    repo = _repo(["README.md", "infra/main.tf"])
    assert classify_repo_kind(repo) is RepoKind.CODE


def test_scripts_without_manifest_are_non_code() -> None:
    # Loose scripts next to documentation don't make a delivery repo.
    repo = _repo(["README.md", "scripts/export-cards.py"])
    assert classify_repo_kind(repo) is RepoKind.NON_CODE


def test_empty_repo_is_code() -> None:
    # Fail safe: never downgrade a repo we can't read anything from.
    repo = _repo([])
    assert classify_repo_kind(repo) is RepoKind.CODE


def test_non_git_path_is_code() -> None:
    # Fail safe: a failing `git ls-files` must not produce NON_CODE.
    path = tempfile.mkdtemp()
    assert classify_repo_kind(path) is RepoKind.CODE


def test_manifest_name_must_match_exactly() -> None:
    # `mypackage.json` is not `package.json`.
    repo = _repo(["README.md", "data/mypackage.json"])
    assert classify_repo_kind(repo) is RepoKind.NON_CODE


if __name__ == "__main__":
    tests = [fn for name, fn in globals().items() if name.startswith("test_")]
    failed = 0
    for fn in tests:
        try:
            fn()
            print(f"ok  {fn.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {fn.__name__}: {exc}")
    if failed:
        print(f"\n{failed} failure(s)")
        sys.exit(1)
    print(f"\n{len(tests)} tests passed")
