"""Tests for repository kind classification.

Builds throwaway Git repos on disk, since the classifier reads `git ls-files`.

Runnable as a plain script: `python tests/test_repo_kind.py`.
No external test framework required.
"""

import subprocess
import sys
import tempfile
from pathlib import Path

# Allow running from repo root without installation.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.analysis.repo_kind import RepoKind, classify_repo_kind


def _repo(base: Path, files: list[str]) -> str:
    """Create a Git repo under base tracking the given paths. Returns its path."""
    path = base / "repo"
    path.mkdir()
    subprocess.run(["git", "init", "-q", str(path)], check=True)
    for rel in files:
        full = path / rel
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_text("x\n")
    subprocess.run(["git", "-C", str(path), "add", "-A"], check=True,
                   capture_output=True)
    return str(path)


def test_docs_only_repo_is_non_code(tmp_path: Path) -> None:
    # The shape of an issue-board repo: markdown, images, issue templates.
    repo = _repo(tmp_path, [
        "README.md",
        "docs/roadmap.md",
        "docs/diagram.png",
        ".github/ISSUE_TEMPLATE/bug.yml",
    ])
    assert classify_repo_kind(repo) is RepoKind.NON_CODE


def test_node_repo_is_code(tmp_path: Path) -> None:
    repo = _repo(tmp_path, ["package.json", "src/index.ts", "README.md"])
    assert classify_repo_kind(repo) is RepoKind.CODE


def test_maven_repo_is_code(tmp_path: Path) -> None:
    repo = _repo(tmp_path, ["pom.xml", "src/main/java/App.java"])
    assert classify_repo_kind(repo) is RepoKind.CODE


def test_nested_manifest_is_code(tmp_path: Path) -> None:
    # Monorepos keep manifests below the root.
    repo = _repo(tmp_path, [
        "README.md", "services/api/go.mod", "services/api/main.go",
    ])
    assert classify_repo_kind(repo) is RepoKind.CODE


def test_suffix_manifest_is_code(tmp_path: Path) -> None:
    repo = _repo(tmp_path, ["README.md", "src/App.csproj"])
    assert classify_repo_kind(repo) is RepoKind.CODE


def test_deploy_only_repo_is_code(tmp_path: Path) -> None:
    # Nothing compiles here, but something is deployed from it.
    repo = _repo(tmp_path, ["README.md", "infra/main.tf"])
    assert classify_repo_kind(repo) is RepoKind.CODE


def test_terraform_repo_without_main_tf_is_code(tmp_path: Path) -> None:
    # Terraform mandates no file name, so the extension is the only signal.
    repo = _repo(tmp_path, [
        "README.md",
        "terraform/prod/vpc.tf",
        "terraform/prod/variables.tf",
        "terraform/prod/outputs.tf",
    ])
    assert classify_repo_kind(repo) is RepoKind.CODE


def test_scripts_without_manifest_are_non_code(tmp_path: Path) -> None:
    # Loose scripts next to documentation don't make a delivery repo.
    repo = _repo(tmp_path, ["README.md", "scripts/export-cards.py"])
    assert classify_repo_kind(repo) is RepoKind.NON_CODE


def test_empty_repo_is_code(tmp_path: Path) -> None:
    # Fail safe: never downgrade a repo we can't read anything from.
    repo = _repo(tmp_path, [])
    assert classify_repo_kind(repo) is RepoKind.CODE


def test_non_git_path_is_code(tmp_path: Path) -> None:
    # Fail safe: a failing `git ls-files` must not produce NON_CODE.
    assert classify_repo_kind(str(tmp_path)) is RepoKind.CODE


def test_manifest_name_must_match_exactly(tmp_path: Path) -> None:
    # `mypackage.json` is not `package.json`.
    repo = _repo(tmp_path, ["README.md", "data/mypackage.json"])
    assert classify_repo_kind(repo) is RepoKind.NON_CODE


if __name__ == "__main__":
    tests = [fn for name, fn in globals().items() if name.startswith("test_")]
    failed = 0
    for fn in tests:
        with tempfile.TemporaryDirectory() as tmp:
            try:
                fn(Path(tmp))
                print(f"ok  {fn.__name__}")
            except AssertionError as exc:
                failed += 1
                print(f"FAIL {fn.__name__}: {exc}")
    if failed:
        print(f"\n{failed} failure(s)")
        sys.exit(1)
    print(f"\n{len(tests)} tests passed")
