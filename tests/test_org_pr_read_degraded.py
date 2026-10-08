"""Tests that the org outputs flag repositories whose PR read degraded.

A repository whose PR read failed shows 0 PRs in the org report; without a
mark that reads as "no PRs" rather than "PR data missing".

Runnable as a plain script: `python tests/test_org_pr_read_degraded.py`.
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

_EN_NOTE = "PR data is incomplete this run for"
_PT_NOTE = "Os dados de PR estão incompletos nesta execução para"


def _metrics(pr_enrichment_degraded: list[str] | None = None) -> ReportMetrics:
    return ReportMetrics(
        commits_total=100,
        commits_revert=10,
        revert_rate=0.1,
        churn_events=5,
        churn_lines_affected=500,
        files_touched=50,
        files_stabilized=30,
        stabilization_ratio=0.6,
        repo_kind="CODE",
        pr_enrichment_degraded=pr_enrichment_degraded,
    )


def _org(*repos: RepoResult) -> OrgResult:
    return OrgResult(
        org_name="acme",
        repos=list(repos),
        change_attribution="",
        attention_signals=[],
        delivery_narrative="",
    )


_DEGRADED = RepoResult("widgets", _metrics(["basic"]), trend=None)
_CLEAN = RepoResult("gadgets", _metrics(), trend=None)


def _report_text(org: OrgResult, out_dir: Path, lang: str = "en") -> str:
    path = write_org_report(
        org, out_dir=str(out_dir), days=90, recent_days=30, lang=lang
    )
    return Path(path).read_text()


def _metrics_json(org: OrgResult, out_dir: Path) -> dict:
    path = write_org_metrics(org, out_dir=str(out_dir), days=90)
    return json.loads(Path(path).read_text())


def test_org_report_names_repos_with_degraded_pr_read(tmp_path: Path) -> None:
    text = _report_text(_org(_DEGRADED, _CLEAN), tmp_path)
    assert _EN_NOTE in text
    note = text.split(_EN_NOTE)[1].split("\n")[0]
    assert "1 repository(ies) (widgets)" in note
    assert "gadgets" not in note


def test_org_report_has_no_pr_read_note_when_clean(tmp_path: Path) -> None:
    text = _report_text(_org(_CLEAN), tmp_path)
    assert _EN_NOTE not in text


def test_org_metrics_carries_the_degradation_per_repo(tmp_path: Path) -> None:
    data = _metrics_json(_org(_DEGRADED, _CLEAN), tmp_path)
    entries = {entry["name"]: entry for entry in data["repos"]}
    assert entries["widgets"]["pr_enrichment_degraded"] == ["basic"]
    assert "pr_enrichment_degraded" not in entries["gadgets"]


def test_org_pr_read_note_is_translated(tmp_path: Path) -> None:
    text = _report_text(_org(_DEGRADED, _CLEAN), tmp_path, lang="pt-br")
    assert _PT_NOTE in text
    assert _EN_NOTE not in text


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
