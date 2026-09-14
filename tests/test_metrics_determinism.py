"""The engine produces the same output twice on the same commit.

This is the premise parity depends on: if two identical runs already
diverge, comparing a worker run against a local one proves nothing. The
test builds a real repository and runs the engine against it twice.

Runnable as: `python -m pytest tests/test_metrics_determinism.py -v`
"""

import glob
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.reports.metrics_diff import compare_metrics, format_divergences

REPO_ROOT = Path(__file__).resolve().parent.parent


def _git(args: list[str], cwd: Path) -> None:
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True)


def _build_repo(path: Path) -> None:
    """Small history, but with a file touched across several commits.

    Several touches to the same file is what makes the durability
    calculation actually run - it is the path that uses `git blame` and the
    current clock, and therefore the most exposed to drift between two runs.
    """
    _git(["init", "-q", "-b", "main", "."], cwd=path)
    _git(["config", "user.email", "test@example.com"], cwd=path)
    _git(["config", "user.name", "Test"], cwd=path)
    # Hermetic against global git config: someone's global commit.gpgsign or
    # init.templateDir hooks must not be able to break or hang this test.
    _git(["config", "commit.gpgsign", "false"], cwd=path)
    _git(["config", "core.hooksPath", str(path / "no-hooks")], cwd=path)

    for round_index in range(1, 6):
        for name in ("a", "b", "c", "d"):
            (path / f"{name}.py").write_text(f"l1\nl2\nl{round_index}\n", encoding="utf-8")
        _git(["add", "-A"], cwd=path)
        _git(["commit", "-q", "-m", f"feat: round {round_index}"], cwd=path)

    for name in ("a", "b", "c", "d"):
        (path / f"{name}.py").write_text("l1\nl2\nl9\nl10\n", encoding="utf-8")
    _git(["add", "-A"], cwd=path)
    _git(
        [
            "commit", "-q", "-m",
            "fix: final\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
        ],
        cwd=path,
    )


def _run_engine(repo: Path, out_dir: Path) -> dict:
    # The console script, not `python -m iris`: the package has no
    # `__main__.py`, and `[project.scripts]` declares `iris = "iris.cli:main"`.
    # CI installs it with `pip install -e .` before running the tests.
    engine = shutil.which("iris")
    if engine is None:
        pytest.skip("console script `iris` missing - run `pip install -e .`")

    result = subprocess.run(
        [engine, str(repo), "--days", "30", "--no-push", "--out", str(out_dir)],
        cwd=REPO_ROOT, capture_output=True, text=True,
    )
    assert result.returncode == 0, f"engine failed:\n{result.stdout}\n{result.stderr}"
    matches = glob.glob(str(out_dir / "**" / "*-metrics.json"), recursive=True)
    assert matches, f"no metrics.json under {out_dir}"
    return json.loads(Path(matches[0]).read_text(encoding="utf-8"))


def test_two_runs_on_the_same_commit_produce_identical_metrics(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    _build_repo(repo)

    first = _run_engine(repo, tmp_path / "out1")
    second = _run_engine(repo, tmp_path / "out2")

    divergences = compare_metrics(first, second)
    assert divergences == [], (
        "two runs on the same commit diverged - either the engine gained a "
        "source of non-determinism, or the key needs to go into IGNORED_PATHS "
        f"with the measured reason:\n{format_divergences(divergences)}"
    )


def test_the_run_actually_exercised_durability(tmp_path):
    # Guards against the test above passing vacuously: if durability is
    # skipped, the path most exposed to drift never runs at all.
    repo = tmp_path / "repo"
    repo.mkdir()
    _build_repo(repo)

    payload = _run_engine(repo, tmp_path / "out")

    assert payload.get("durability_files_analyzed", 0) > 0
