"""Tests the report caveat for runs whose PR read degraded (issue #236).

A degraded PR read leaves the merge strategy unknown and flow, review and
in-PR metrics missing or understated. The report has to say so at the top,
where a reader meets it before any number — not inside the PR section, which a
failed read can remove entirely.

Runnable as: `python -m pytest tests/test_pr_enrichment_caveat.py -v`
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.i18n import get_strings
from iris.models.context import AnalysisContext
from iris.models.metrics import ReportMetrics
from iris.reports.writer import write_report_md

_CAVEAT_EN = "PR data is incomplete for this run"
_CAVEAT_PT = "Os dados de PR estão incompletos nesta execução"


def _report_text(out_dir: Path, degraded: list[str] | None, lang: str = "en") -> str:
    ctx = AnalysisContext(
        repo_path=str(out_dir),
        repo_name="widgets",
        days=90,
        churn_days=14,
        out_dir=str(out_dir),
        lang=lang,
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
        pr_enrichment_degraded=degraded,
    )
    path = write_report_md(ctx, metrics, out_dir=str(out_dir))
    return Path(path).read_text(encoding="utf-8")


def test_degraded_run_states_the_caveat_with_the_failed_steps(tmp_path):
    text = _report_text(tmp_path, ["enrichment", "reviews"])

    assert _CAVEAT_EN in text
    assert "enrichment, reviews" in text


def test_caveat_does_not_depend_on_the_pr_section(tmp_path):
    # A basic pass that failed in every state leaves no PR data, so the PR
    # section is not rendered at all — the caveat must still be there.
    text = _report_text(tmp_path, ["basic"])

    assert get_strings("en")["section_pr_lifecycle"] not in text
    assert _CAVEAT_EN in text


def test_caveat_is_translated(tmp_path):
    assert _CAVEAT_PT in _report_text(tmp_path, ["enrichment"], lang="pt-br")


def test_clean_run_has_no_caveat(tmp_path):
    assert _CAVEAT_EN not in _report_text(tmp_path, None)


def test_caveat_lists_open_pr_metrics_among_what_may_be_missing(tmp_path):
    # A failed open list, or a failed enrichment or reviews pass for open
    # PRs, omits open-PR fields too, so the caveat names them.
    assert "flow, review, in-PR and open-PR metrics" in _report_text(tmp_path, ["basic"])
    assert "de commits em PR e de PRs abertos" in _report_text(
        tmp_path, ["basic"], lang="pt-br")
