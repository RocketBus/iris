"""Tests that documentation repos stay out of org-level comparisons.

A docs/board repo is still analyzed and still listed in the overview table;
what it must not do is move the org medians or the Human-vs-AI comparison.

Runnable as a plain script: `python tests/test_org_non_code_exclusion.py`.
No external test framework required.
"""

import json
import sys
import tempfile
from pathlib import Path

# Allow running from repo root without installation.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.models.metrics import ReportMetrics
from iris.models.org import OrgResult, RepoResult
from iris.reports.org_writer import write_org_metrics, write_org_report


def _metrics(
    stabilization: float,
    repo_kind: str,
    revert_rate: float = 0.1,
    stabilization_by_origin: dict | None = None,
    ai_detection_coverage_pct: float | None = None,
):
    return ReportMetrics(
        commits_total=100,
        commits_revert=10,
        revert_rate=revert_rate,
        churn_events=5,
        churn_lines_affected=500,
        files_touched=50,
        files_stabilized=int(50 * stabilization),
        stabilization_ratio=stabilization,
        repo_kind=repo_kind,
        stabilization_by_origin=stabilization_by_origin,
        ai_detection_coverage_pct=ai_detection_coverage_pct,
    )


def _by_origin(human: float, ai: float) -> dict:
    return {
        "HUMAN": {"stabilization_ratio": human, "files_touched": 20},
        "AI_ASSISTED": {"stabilization_ratio": ai, "files_touched": 20},
    }


def _org(*repos: RepoResult) -> OrgResult:
    return OrgResult(
        org_name="acme",
        repos=list(repos),
        change_attribution="",
        attention_signals=[],
        delivery_narrative="",
    )


# One service at 0.60, one docs repo at 1.00 (prose rarely gets revisited).
# Median over both is 0.80; median over the service alone is 0.60.
_SERVICE = RepoResult("payments", _metrics(0.60, "CODE"), trend=None)
_DOCS = RepoResult("team-board", _metrics(1.00, "NON_CODE"), trend=None)


def _report_text(org: OrgResult, out_dir: Path) -> str:
    path = write_org_report(org, out_dir=str(out_dir), days=90, recent_days=30)
    return Path(path).read_text()


def _metrics_json(org: OrgResult, out_dir: Path) -> dict:
    path = write_org_metrics(org, out_dir=str(out_dir), days=90)
    return json.loads(Path(path).read_text())


def test_median_ignores_non_code_repo(tmp_path: Path) -> None:
    text = _report_text(_org(_SERVICE, _DOCS), tmp_path)
    assert "60.0%" in text, "median should be the service's, not the blend"
    assert "80.0%" not in text


def test_median_json_ignores_non_code_repo(tmp_path: Path) -> None:
    data = _metrics_json(_org(_SERVICE, _DOCS), tmp_path)
    assert data["median_stabilization_ratio"] == 0.6
    assert data["median_stabilization_repos"] == 1
    assert data["repos_analyzed"] == 2, "the repo is excluded, not dropped"


def test_non_code_repo_still_listed(tmp_path: Path) -> None:
    text = _report_text(_org(_SERVICE, _DOCS), tmp_path)
    assert "team-board" in text, "excluded from comparison, not from the report"


def test_exclusion_is_stated_with_repo_names(tmp_path: Path) -> None:
    text = _report_text(_org(_SERVICE, _DOCS), tmp_path)
    assert "excluded from the comparisons" in text
    assert "team-board" in text.split("excluded from the comparisons")[1]


def test_comparison_repo_count_is_labeled(tmp_path: Path) -> None:
    text = _report_text(_org(_SERVICE, _DOCS), tmp_path)
    assert "| Repos analyzed | 2 |" in text
    assert "| Repos in comparisons | 1 |" in text


def test_no_notice_when_every_repo_is_code(tmp_path: Path) -> None:
    text = _report_text(_org(_SERVICE), tmp_path)
    assert "excluded from the comparisons" not in text
    assert "Repos in comparisons" not in text


def test_repo_kind_is_carried_into_org_metrics(tmp_path: Path) -> None:
    data = _metrics_json(_org(_SERVICE, _DOCS), tmp_path)
    kinds = {entry["name"]: entry["repo_kind"] for entry in data["repos"]}
    assert kinds == {"payments": "CODE", "team-board": "NON_CODE"}


def test_unknown_repo_kind_counts_as_code(tmp_path: Path) -> None:
    # Metrics pushed by an older CLI carry no repo_kind — they must keep
    # counting toward the median rather than silently vanishing from it.
    legacy = RepoResult("legacy", _metrics(0.20, repo_kind=None), trend=None)
    data = _metrics_json(_org(_SERVICE, legacy), tmp_path)
    assert data["median_stabilization_repos"] == 2
    assert data["median_stabilization_ratio"] == 0.4


def test_all_non_code_org_reports_median_as_unavailable(tmp_path: Path) -> None:
    # 0.0% would read as a catastrophic delivery signal instead of "no data".
    text = _report_text(_org(_DOCS), tmp_path)
    assert "| Median stabilization | N/A |" in text
    assert "| Median revert rate | N/A |" in text
    assert "0.0%" not in text


def test_all_non_code_org_median_is_null_in_json(tmp_path: Path) -> None:
    data = _metrics_json(_org(_DOCS), tmp_path)
    assert data["median_stabilization_ratio"] is None
    assert data["median_stabilization_repos"] == 0


def test_human_vs_ai_comparison_ignores_non_code_repo(tmp_path: Path) -> None:
    service = RepoResult(
        "payments",
        _metrics(
            0.60, "CODE",
            stabilization_by_origin=_by_origin(0.60, 0.40),
            ai_detection_coverage_pct=45.0,
        ),
        trend=None,
    )
    docs = RepoResult(
        "team-board",
        _metrics(
            1.00, "NON_CODE",
            stabilization_by_origin=_by_origin(1.00, 1.00),
            ai_detection_coverage_pct=45.0,
        ),
        trend=None,
    )
    text = _report_text(_org(service, docs), tmp_path)
    assert "Of 1 repositories, 1 contain AI-assisted commits" in text
    assert "Human 60%, AI-Assisted 40%" in text
    assert "Human 80%" not in text


def test_detection_coverage_breakdown_ignores_non_code_repo(tmp_path: Path) -> None:
    service = RepoResult(
        "payments",
        _metrics(
            0.60, "CODE",
            stabilization_by_origin=_by_origin(0.60, 0.40),
            ai_detection_coverage_pct=45.0,
        ),
        trend=None,
    )
    docs = RepoResult(
        "team-board",
        _metrics(
            1.00, "NON_CODE",
            stabilization_by_origin=_by_origin(1.00, 1.00),
            ai_detection_coverage_pct=45.0,
        ),
        trend=None,
    )
    text = _report_text(_org(service, docs), tmp_path)
    assert "Detection coverage: 1 repos with high coverage" in text
    assert "0 with low coverage" in text
    assert "0 with no AI detected" in text


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
