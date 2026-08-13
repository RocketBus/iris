"""Tests the repo report caveat for repositories that ship no software.

The metrics of a docs/board repo compute cleanly, so the report has to say
what they describe before anyone reads them as delivery signal.

Runnable as a plain script: `python tests/test_non_code_repo_caveat.py`.
No external test framework required.
"""

import sys
import tempfile
from pathlib import Path

# Allow running from repo root without installation.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.models.context import AnalysisContext
from iris.models.metrics import ReportMetrics
from iris.reports.writer import write_report_md

_CAVEAT = "No project manifest is tracked in this repository"


def _report_text(repo_kind: str | None, out_dir: Path) -> str:
    ctx = AnalysisContext(
        repo_path=str(out_dir),
        repo_name="team-board",
        days=90,
        churn_days=14,
        out_dir=str(out_dir),
    )
    metrics = ReportMetrics(
        commits_total=100,
        commits_revert=10,
        revert_rate=0.1,
        churn_events=5,
        churn_lines_affected=500,
        files_touched=50,
        files_stabilized=45,
        stabilization_ratio=0.90,
        repo_kind=repo_kind,
    )
    path = write_report_md(ctx, metrics, out_dir=str(out_dir))
    return Path(path).read_text()


def test_non_code_repo_report_states_the_caveat(tmp_path: Path) -> None:
    assert _CAVEAT in _report_text("NON_CODE", tmp_path)


def test_code_repo_report_has_no_caveat(tmp_path: Path) -> None:
    assert _CAVEAT not in _report_text("CODE", tmp_path)


def test_unknown_repo_kind_has_no_caveat(tmp_path: Path) -> None:
    # Older CLIs stamp no repo_kind; absence must not imply documentation.
    assert _CAVEAT not in _report_text(None, tmp_path)


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
