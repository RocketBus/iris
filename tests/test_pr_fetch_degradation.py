"""Tests for the PR-read degradation signal (issue #236).

When a step of the GitHub PR read fails, the engine used to fall back to
partial data without saying so: two runs on the same commit could disagree on
merge strategy and flow metrics with nothing in the output explaining why.
These tests pin the signal from where it starts to where it is reported.

Runnable as: `python -m pytest tests/test_pr_fetch_degradation.py -v`
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.ingestion import github_reader, window_cache
from iris.models.pull_request import DEGRADED_FETCH, PullRequestFetch


def setup_function():
    window_cache.reset()


def teardown_function():
    window_cache.reset()


# --- absence by design is not degradation ----------------------------------


def test_no_gh_is_absence_not_degradation(monkeypatch):
    monkeypatch.setattr(github_reader, "is_gh_available", lambda: False)

    fetch = github_reader.read_pull_requests("/any/repo", days=30)

    assert fetch == PullRequestFetch(prs=[], degraded=())


def test_no_github_remote_is_absence_not_degradation(monkeypatch):
    monkeypatch.setattr(github_reader, "is_gh_available", lambda: True)
    monkeypatch.setattr(github_reader, "detect_github_remote", lambda _path: None)

    fetch = github_reader.read_pull_requests("/any/repo", days=30)

    assert fetch == PullRequestFetch(prs=[], degraded=())


# --- the whole read failing ------------------------------------------------


def test_fallback_marks_the_fetch_step_when_the_read_raises(monkeypatch):
    def broken_read(_repo_path, _days):
        raise RuntimeError("unexpected gh output")

    monkeypatch.setattr(github_reader, "_read_pull_requests_uncached", broken_read)

    fetch = github_reader.read_pull_requests_with_fallback("/any/repo", days=30)

    assert fetch == PullRequestFetch(prs=[], degraded=(DEGRADED_FETCH,))


# --- the read steps, with a fake gh ----------------------------------------
#
# The reader calls `subprocess.run(..., check=True)` and relies on the
# `CalledProcessError` a failing gh raises, so the fake raises it too —
# returning a non-zero code would never reach the failure path.

import json
import subprocess
from types import SimpleNamespace


def _ok(payload) -> SimpleNamespace:
    return SimpleNamespace(returncode=0, stdout=json.dumps(payload), stderr="")


def _graphql_page(numbers, *, has_next=False, cursor=None) -> dict:
    return {"data": {"repository": {"pullRequests": {
        "pageInfo": {"endCursor": cursor, "hasNextPage": has_next},
        "nodes": [
            {
                "number": n,
                "mergeCommit": {"oid": f"merge{n}", "parents": {"totalCount": 2}},
                "commits": {"nodes": [{"commit": {
                    "oid": f"commit{n}",
                    "messageHeadline": f"change {n}",
                    "committedDate": "2026-09-01T00:00:00Z",
                    "authoredDate": "2026-09-01T00:00:00Z",
                }}]},
            }
            for n in numbers
        ],
    }}}}


def _fake_gh(monkeypatch, *, full=None, basic=None, graphql=(), reviews=None):
    """Route each gh call to a scripted answer.

    `full`, `basic` and `reviews` are a payload, or an exception to raise.
    `graphql` is the sequence of answers for successive GraphQL calls. Returns
    the list of pauses the retry slept, so a test can assert on them.
    """
    graphql_answers = list(graphql)
    sleeps: list[float] = []

    def answer(spec, cmd):
        if isinstance(spec, BaseException):
            raise spec
        if spec is None:
            raise subprocess.CalledProcessError(1, cmd)
        return _ok(spec)

    def fake_run(cmd, **kwargs):
        if cmd[:3] == ["gh", "api", "graphql"]:
            return answer(graphql_answers.pop(0), cmd)
        fields = cmd[cmd.index("--json") + 1]
        if fields == "number,reviews":
            return answer(reviews, cmd)
        if "commits" in fields:
            return answer(full, cmd)
        return answer(basic, cmd)

    monkeypatch.setattr(github_reader.subprocess, "run", fake_run)
    monkeypatch.setattr(github_reader.time, "sleep", sleeps.append)
    return sleeps


def _failure() -> subprocess.CalledProcessError:
    return subprocess.CalledProcessError(1, ["gh"], stderr="HTTP 504")


def test_enrichment_completes_on_a_single_page(monkeypatch):
    sleeps = _fake_gh(monkeypatch, graphql=[_graphql_page([1, 2])])

    by_pr, complete = github_reader._fetch_pr_enrichment_graphql("acme/widgets", "merged", 500)

    assert sorted(by_pr) == [1, 2]
    assert complete is True
    assert sleeps == []


def test_enrichment_retries_once_and_recovers(monkeypatch):
    sleeps = _fake_gh(monkeypatch, graphql=[_failure(), _graphql_page([1])])

    by_pr, complete = github_reader._fetch_pr_enrichment_graphql("acme/widgets", "merged", 500)

    assert sorted(by_pr) == [1]
    assert complete is True
    assert sleeps == [github_reader._ENRICHMENT_RETRY_DELAY_S]


def test_enrichment_that_fails_twice_is_incomplete(monkeypatch):
    sleeps = _fake_gh(monkeypatch, graphql=[_failure(), _failure()])

    by_pr, complete = github_reader._fetch_pr_enrichment_graphql("acme/widgets", "merged", 500)

    assert by_pr == {}
    assert complete is False
    assert sleeps == [github_reader._ENRICHMENT_RETRY_DELAY_S]


def test_enrichment_failing_on_a_later_page_keeps_what_it_has_but_is_incomplete(monkeypatch):
    _fake_gh(monkeypatch, graphql=[
        _graphql_page([1, 2], has_next=True, cursor="page2"),
        _failure(),
        _failure(),
    ])

    by_pr, complete = github_reader._fetch_pr_enrichment_graphql("acme/widgets", "merged", 500)

    # The first page is real data and stays; the read is still incomplete.
    assert sorted(by_pr) == [1, 2]
    assert complete is False


def test_enrichment_response_without_data_is_incomplete(monkeypatch):
    _fake_gh(monkeypatch, graphql=[{"errors": [{"message": "Something went wrong"}]}])

    by_pr, complete = github_reader._fetch_pr_enrichment_graphql("acme/widgets", "merged", 500)

    assert by_pr == {}
    assert complete is False


def test_one_shot_fetch_is_never_degraded(monkeypatch):
    _fake_gh(monkeypatch, full=[{"number": 1}])

    prs, degraded = github_reader._fetch_prs("acme/widgets", 500, "merged")

    assert prs == [{"number": 1}]
    assert degraded == set()


def test_failed_basic_pass_drops_the_state_and_says_so(monkeypatch):
    _fake_gh(monkeypatch, basic=None)

    # Above the one-shot limit, so the three-pass path runs.
    prs, degraded = github_reader._fetch_prs("acme/widgets", 1000, "merged")

    assert prs == []
    assert degraded == {"basic"}


def test_failed_enrichment_is_reported(monkeypatch):
    _fake_gh(
        monkeypatch,
        basic=[{"number": 1}],
        graphql=[_failure(), _failure()],
        reviews=[{"number": 1, "reviews": []}],
    )

    prs, degraded = github_reader._fetch_prs("acme/widgets", 1000, "merged")

    assert [pr["number"] for pr in prs] == [1]
    assert prs[0]["commits"] == []
    assert degraded == {"enrichment"}


def test_failed_reviews_pass_is_reported(monkeypatch):
    _fake_gh(
        monkeypatch,
        basic=[{"number": 1}],
        graphql=[_graphql_page([1])],
        reviews=None,
    )

    _prs, degraded = github_reader._fetch_prs("acme/widgets", 1000, "merged")

    assert degraded == {"reviews"}


def test_empty_reviews_list_is_not_a_failure(monkeypatch):
    _fake_gh(
        monkeypatch,
        basic=[{"number": 1}],
        graphql=[_graphql_page([1])],
        reviews=[],
    )

    _prs, degraded = github_reader._fetch_prs("acme/widgets", 1000, "merged")

    assert degraded == set()


def test_degraded_steps_from_every_state_are_merged_and_sorted(monkeypatch):
    per_state = {
        "merged": ([], {"reviews", "enrichment"}),
        "closed": ([], set()),
        "open": ([], {"enrichment"}),
    }
    monkeypatch.setattr(github_reader, "is_gh_available", lambda: True)
    monkeypatch.setattr(github_reader, "detect_github_remote", lambda _path: "acme/widgets")
    monkeypatch.setattr(
        github_reader, "_fetch_prs", lambda _nwo, _limit, state: per_state[state],
    )

    fetch = github_reader.read_pull_requests("/any/repo", days=30)

    assert fetch.degraded == ("enrichment", "reviews")


# --- the signal in the metrics ---------------------------------------------

import argparse
import glob
from datetime import datetime, timedelta, timezone

from iris.metrics.aggregator import aggregate
from iris.models.commit import Commit
from iris.models.pull_request import PullRequest

_NOW = datetime(2026, 9, 1, tzinfo=timezone.utc)


def _stamped_commits() -> list[Commit]:
    # Squash-stamped subjects: under degraded enrichment they are all the
    # fallback heuristic can see.
    return [
        Commit(hash=f"c{n}", author="dev", date=_NOW + timedelta(hours=n),
               message=f"change {n} (#{n})")
        for n in range(1, 7)
    ]


def _merged_prs() -> list[PullRequest]:
    return [
        PullRequest(number=n, title=f"PR {n}", author="dev", created_at=_NOW,
                    additions=1, deletions=0, changed_files=1,
                    merged_at=_NOW + timedelta(hours=n),
                    closed_at=_NOW + timedelta(hours=n), state="merged")
        for n in range(1, 7)
    ]


def test_degraded_fetch_reaches_the_metrics_payload():
    metrics = aggregate(
        _stamped_commits(), churn_days=14, prs=_merged_prs(),
        pr_fetch_degraded=("enrichment", "reviews"),
    )
    payload = metrics.to_dict()

    assert payload["pr_enrichment_degraded"] == ["enrichment", "reviews"]
    assert payload["merge_strategy"] == "unknown"
    assert "merge_strategy_dominant_share" not in payload


def test_clean_fetch_leaves_the_payload_unchanged():
    metrics = aggregate(_stamped_commits(), churn_days=14, prs=_merged_prs())
    payload = metrics.to_dict()

    # No key at all, so a clean run's metrics.json is what it was before.
    assert "pr_enrichment_degraded" not in payload
    assert payload["merge_strategy"] == "squash"


# --- both entry points carry it into metrics.json ---------------------------


def _build_repo(path: Path) -> None:
    """A small git repo, hermetic against the machine's global git config."""
    def git(*args):
        subprocess.run(["git", *args], cwd=path, check=True, capture_output=True)

    git("init", "-q", "-b", "main", ".")
    git("config", "user.email", "test@example.com")
    git("config", "user.name", "Test")
    git("config", "commit.gpgsign", "false")
    git("config", "core.hooksPath", str(path / "no-hooks"))
    for n in range(1, 4):
        (path / "a.py").write_text(f"x = {n}\n", encoding="utf-8")
        git("add", "-A")
        git("commit", "-q", "-m", f"feat: change {n}")


def _degraded_read(_repo_path, days):
    return PullRequestFetch(prs=[], degraded=("enrichment",))


def _metrics_json(out_dir: Path) -> dict:
    [path] = glob.glob(str(out_dir / "**" / "*-metrics.json"), recursive=True)
    return json.loads(Path(path).read_text(encoding="utf-8"))


def test_single_repo_cli_writes_the_degradation_to_metrics_json(tmp_path, monkeypatch):
    from iris import cli

    repo = tmp_path / "repo"
    repo.mkdir()
    _build_repo(repo)
    monkeypatch.setattr(cli, "read_pull_requests_with_fallback", _degraded_read)

    args = argparse.Namespace(
        repo_path=str(repo), days=30, churn_days=14, lang="en", recent_days=30,
        verbose=False, trend=False, out=str(tmp_path / "out"), no_push=True,
    )
    cli._run_single_repo(args)

    assert _metrics_json(tmp_path / "out")["pr_enrichment_degraded"] == ["enrichment"]


def test_org_runner_writes_the_degradation_to_metrics_json(tmp_path, monkeypatch):
    from iris import org_runner

    repo = tmp_path / "repo"
    repo.mkdir()
    _build_repo(repo)
    monkeypatch.setattr(org_runner, "read_pull_requests_with_fallback", _degraded_read)

    org_runner.analyze_single_repo(
        str(repo), days=30, churn_days=14, out_dir=str(tmp_path / "out"),
    )

    assert _metrics_json(tmp_path / "out")["pr_enrichment_degraded"] == ["enrichment"]


# --- the adoption split inherits it -----------------------------------------


def _adoption_after_first_commit(monkeypatch):
    """Make adoption detection split the history after its first commit."""
    from iris.analysis import adoption_detector
    from iris.models.adoption import AdoptionEvent

    def detect(commits):
        ordered = sorted(commits, key=lambda c: c.date)
        start = ordered[1].date
        event = AdoptionEvent(
            first_ai_commit_date=start, adoption_ramp_start=start,
            adoption_ramp_end=ordered[-1].date, adoption_confidence="clear",
            total_ai_commits=2,
        )
        return event, ordered[:1], ordered[1:]

    monkeypatch.setattr(adoption_detector, "detect_adoption", detect)


def _assert_adoption_split_is_degraded(out_dir: Path) -> None:
    timeline = _metrics_json(out_dir)["adoption_timeline"]
    assert timeline["pre_adoption"]["pr_enrichment_degraded"] == ["enrichment"]
    assert timeline["post_adoption"]["pr_enrichment_degraded"] == ["enrichment"]


def test_single_repo_cli_adoption_split_inherits_the_degradation(tmp_path, monkeypatch):
    from iris import cli

    repo = tmp_path / "repo"
    repo.mkdir()
    _build_repo(repo)
    monkeypatch.setattr(cli, "read_pull_requests_with_fallback", _degraded_read)
    _adoption_after_first_commit(monkeypatch)

    args = argparse.Namespace(
        repo_path=str(repo), days=30, churn_days=14, lang="en", recent_days=30,
        verbose=False, trend=False, out=str(tmp_path / "out"), no_push=True,
    )
    cli._run_single_repo(args)

    _assert_adoption_split_is_degraded(tmp_path / "out")


def test_org_runner_adoption_split_inherits_the_degradation(tmp_path, monkeypatch):
    from iris import org_runner

    repo = tmp_path / "repo"
    repo.mkdir()
    _build_repo(repo)
    monkeypatch.setattr(org_runner, "read_pull_requests_with_fallback", _degraded_read)
    _adoption_after_first_commit(monkeypatch)

    org_runner.analyze_single_repo(
        str(repo), days=30, churn_days=14, out_dir=str(tmp_path / "out"),
    )

    _assert_adoption_split_is_degraded(tmp_path / "out")


def test_single_repo_cli_says_the_pr_read_failed_instead_of_skipped(
    tmp_path, monkeypatch, capsys
):
    from iris import cli

    repo = tmp_path / "repo"
    repo.mkdir()
    _build_repo(repo)
    monkeypatch.setattr(
        cli,
        "read_pull_requests_with_fallback",
        lambda *a, **k: PullRequestFetch(prs=[], degraded=("basic",)),
    )

    args = argparse.Namespace(
        repo_path=str(repo), days=30, churn_days=14, lang="en", recent_days=30,
        verbose=False, trend=False, out=str(tmp_path / "out"), no_push=True,
    )
    cli._run_single_repo(args)

    out = capsys.readouterr().out
    assert "failed (basic)" in out
    assert "skipped (no GitHub remote or gh CLI)" not in out


# --- a failed reviews pass omits the review-derived fields ------------------
#
# With the reviews pass failed every PR carries no reviews, so review coverage
# could only read 0% and the single-pass rate 100%. Those would be numbers the
# run fabricated, so they are left out instead.

from dataclasses import replace

from iris.models.context import AnalysisContext
from iris.models.metrics import ReportMetrics
from iris.models.pull_request import CommitRef, PRReview
from iris.reports.writer import write_report_md

_REVIEW_KEYS = (
    "pr_review_rounds_median",
    "pr_single_pass_rate",
    "median_time_to_first_review_hours",
    "human_review_coverage_pct",
    "human_approval_coverage_pct",
    "human_review_coverage_by_intent",
    "human_review_coverage_by_origin_of_pr",
)

# Flow phases anchor on the first review, and staleness on the last activity:
# with no reviews read, both would be computed from a lie.
_FLOW_KEYS = (
    "flow_efficiency_median",
    "time_in_phase_median_hours",
    "flow_pr_count",
    "flow_efficiency_by_intent",
    "flow_efficiency_by_origin",
)
_STALENESS_KEYS = (
    "stale_open_pr_pct",
    "very_stale_open_pr_pct",
    "abandonment_risk_pct",
    "stale_open_pr_pct_by_origin",
)
# Open PR age depends only on the creation time, so it survives.
_AGE_KEYS = (
    "open_pr_count",
    "median_open_pr_age_days",
    "p90_open_pr_age_days",
)


def _reviewed_prs() -> list[PullRequest]:
    reviews = [
        PRReview(author="reviewer", state="CHANGES_REQUESTED",
                 submitted_at=_NOW + timedelta(minutes=30)),
        PRReview(author="reviewer", state="APPROVED",
                 submitted_at=_NOW + timedelta(minutes=45)),
    ]
    return [
        replace(
            pr, reviews=reviews,
            commit_refs=[CommitRef(hash=f"c{pr.number}",
                                   committed_at=_NOW - timedelta(hours=1))],
        )
        for pr in _merged_prs()
    ]


def _open_prs() -> list[PullRequest]:
    """Five open PRs, old enough to be stale, with a commit each."""
    created = _NOW - timedelta(days=40)
    return [
        PullRequest(number=100 + n, title=f"open {n}", author="dev",
                    created_at=created, additions=1, deletions=0,
                    changed_files=1, state="open",
                    commit_refs=[CommitRef(hash=f"c{n}", committed_at=created)])
        for n in range(1, 6)
    ]


def test_degraded_reviews_omit_review_metrics():
    payload = aggregate(
        _stamped_commits(), churn_days=14, prs=_reviewed_prs() + _open_prs(),
        pr_fetch_degraded=("reviews",),
    ).to_dict()

    assert payload["pr_merged_count"] == 6
    assert payload["open_pr_count"] == 5
    for key in _REVIEW_KEYS + _FLOW_KEYS + _STALENESS_KEYS:
        assert key not in payload, key
    for key in _AGE_KEYS:
        assert key in payload, key
    assert "median_open_pr_age_by_intent" in payload
    for group in payload.get("acceptance_by_origin", {}).values():
        assert "single_pass_rate" not in group
        assert "median_review_rounds" not in group
    for group in payload.get("acceptance_by_tool", {}).values():
        assert "single_pass_rate" not in group
        assert "median_review_rounds" not in group


def test_clean_run_keeps_review_metrics():
    payload = aggregate(
        _stamped_commits(), churn_days=14, prs=_reviewed_prs() + _open_prs(),
    ).to_dict()

    assert payload["pr_single_pass_rate"] == 0.0
    assert payload["pr_review_rounds_median"] == 1.0
    # The by-intent / by-origin splits need 10 merged PRs and acceptance by
    # tool needs an AI-attributed commit, which this fixture does not have;
    # their omission is covered by the degraded twin only trivially.
    segmented = {
        "human_review_coverage_by_intent",
        "human_review_coverage_by_origin_of_pr",
        "flow_efficiency_by_intent",
        "flow_efficiency_by_origin",
    }
    for key in _REVIEW_KEYS + _FLOW_KEYS + _STALENESS_KEYS + _AGE_KEYS:
        if key not in segmented:
            assert key in payload, key
    for group in payload.get("acceptance_by_origin", {}).values():
        assert "single_pass_rate" in group
        assert "median_review_rounds" in group


def test_report_renders_without_review_metrics(tmp_path):
    ctx = AnalysisContext(
        repo_path=str(tmp_path), repo_name="widgets", days=90, churn_days=14,
        out_dir=str(tmp_path), lang="en",
    )
    metrics = ReportMetrics(
        commits_total=100, commits_revert=10, revert_rate=0.1, churn_events=5,
        churn_lines_affected=500, files_touched=50, files_stabilized=45,
        stabilization_ratio=0.90,
        pr_merged_count=6, pr_median_time_to_merge_hours=3.5,
        pr_median_size_files=1, pr_median_size_lines=1,
        pr_review_rounds_median=None, pr_single_pass_rate=None,
        acceptance_by_origin={
            "HUMAN": {"total_commits": 10, "commits_in_prs": 8, "pr_rate": 0.8},
        },
        acceptance_by_tool={
            "tool-a": {"total_commits": 4, "commits_in_prs": 3, "pr_rate": 0.75},
        },
    )

    path = write_report_md(ctx, metrics, out_dir=str(tmp_path))
    text = Path(path).read_text(encoding="utf-8")

    assert "| 80% | — | — |" in text
    assert "| 75% | — | — |" in text
    assert "Single-pass rate" not in text


def test_narrative_skips_single_pass_without_review_metrics():
    from iris.reports.narrative import generate_pr_explanations, generate_pr_findings

    metrics = ReportMetrics(
        commits_total=100, commits_revert=10, revert_rate=0.1, churn_events=5,
        churn_lines_affected=500, files_touched=50, files_stabilized=45,
        stabilization_ratio=0.90,
        pr_merged_count=6, pr_median_time_to_merge_hours=3.5,
    )

    findings = generate_pr_findings(metrics)
    explanations = generate_pr_explanations(metrics)

    assert "6" in findings
    assert "single-pass" not in findings.lower()
    assert "single-pass" not in explanations.lower()


from iris.analysis.trend_delta import compute_trend_delta


def test_trend_skips_single_pass_when_missing():
    def metrics(single_pass):
        return ReportMetrics(
            commits_total=100, commits_revert=10, revert_rate=0.1,
            churn_events=5, churn_lines_affected=500, files_touched=50,
            files_stabilized=45, stabilization_ratio=0.90,
            pr_merged_count=6, pr_median_time_to_merge_hours=3.5,
            pr_single_pass_rate=single_pass,
        )

    trend = compute_trend_delta(metrics(0.8), metrics(None), 90, 30)

    names = [d.metric for d in trend.deltas]
    assert "pr_time_to_merge" in names
    assert "pr_single_pass" not in names


# --- a failed enrichment omits what depends on commit_refs ------------------
#
# Acceptance matches commits to PRs through commit_refs, and open-PR
# staleness reads the last commit push from them. Without the enrichment the
# first reads 0 commits in PRs and the second counts too many PRs as stalled.


def test_degraded_enrichment_omits_acceptance_and_staleness():
    payload = aggregate(
        _stamped_commits(), churn_days=14, prs=_reviewed_prs() + _open_prs(),
        pr_fetch_degraded=("enrichment",),
    ).to_dict()

    assert "acceptance_by_origin" not in payload
    assert "acceptance_by_tool" not in payload
    for key in _STALENESS_KEYS:
        assert key not in payload, key
    for key in _AGE_KEYS:
        assert key in payload, key


def test_clean_run_keeps_acceptance_and_staleness():
    payload = aggregate(
        _stamped_commits(), churn_days=14, prs=_reviewed_prs() + _open_prs(),
    ).to_dict()

    assert payload["acceptance_by_origin"]
    for key in _STALENESS_KEYS:
        if key != "stale_open_pr_pct_by_origin":
            assert key in payload, key


# --- null GraphQL fields are an incomplete read, not a crash ----------------


def test_enrichment_with_null_repository_is_incomplete(monkeypatch):
    _fake_gh(monkeypatch, graphql=[{"data": {"repository": None}}])

    by_pr, complete = github_reader._fetch_pr_enrichment_graphql("acme/widgets", "merged", 500)

    assert by_pr == {}
    assert complete is False


def test_enrichment_node_with_null_commits_has_no_commits(monkeypatch):
    page = _graphql_page([1, 2])
    page["data"]["repository"]["pullRequests"]["nodes"][0]["commits"] = None
    _fake_gh(monkeypatch, graphql=[page])

    by_pr, complete = github_reader._fetch_pr_enrichment_graphql("acme/widgets", "merged", 500)

    assert by_pr[1]["commits"] == []
    assert len(by_pr[2]["commits"]) == 1
    assert complete is True


def test_enrichment_page_with_null_nodes_has_no_prs(monkeypatch):
    page = _graphql_page([])
    page["data"]["repository"]["pullRequests"]["nodes"] = None
    _fake_gh(monkeypatch, graphql=[page])

    by_pr, complete = github_reader._fetch_pr_enrichment_graphql("acme/widgets", "merged", 500)

    assert by_pr == {}
    assert complete is True


def test_enrichment_skips_a_null_node(monkeypatch):
    page = _graphql_page([1, 2])
    page["data"]["repository"]["pullRequests"]["nodes"].insert(1, None)
    _fake_gh(monkeypatch, graphql=[page])

    by_pr, complete = github_reader._fetch_pr_enrichment_graphql("acme/widgets", "merged", 500)

    assert sorted(by_pr) == [1, 2]
    assert complete is True


def test_enrichment_skips_a_null_commit_entry(monkeypatch):
    page = _graphql_page([1])
    page["data"]["repository"]["pullRequests"]["nodes"][0]["commits"]["nodes"].insert(0, None)
    _fake_gh(monkeypatch, graphql=[page])

    by_pr, complete = github_reader._fetch_pr_enrichment_graphql("acme/widgets", "merged", 500)

    assert [c["oid"] for c in by_pr[1]["commits"]] == ["commit1"]
    assert complete is True


# --- string variables are sent as raw fields --------------------------------


def test_cursor_is_passed_as_a_raw_field(monkeypatch):
    seen: list[list[str]] = []
    answers = [
        _graphql_page([1], has_next=True, cursor="@page2"),
        _graphql_page([2]),
    ]

    def fake_run(cmd, **kwargs):
        seen.append(cmd)
        return _ok(answers.pop(0))

    monkeypatch.setattr(github_reader.subprocess, "run", fake_run)

    github_reader._fetch_pr_enrichment_graphql("acme/widgets", "merged", 500)

    # `-F` would read a file named page2 for a value starting with "@".
    assert "cursor=@page2" in seen[1]
    assert seen[1][seen[1].index("cursor=@page2") - 1] == "-f"


@pytest.mark.parametrize("name", ["2048", "true", "null"])
def test_string_variables_are_passed_as_raw_fields(monkeypatch, name):
    # `-F` lets gh coerce a value: a repo named 2048 would be sent as the
    # number 2048 (and `true`/`null` as a boolean/null), which the
    # `String!` variable rejects on every page.
    seen: list[list[str]] = []
    answers = [
        _graphql_page([1], has_next=True, cursor="page2"),
        _graphql_page([2]),
    ]

    def fake_run(cmd, **kwargs):
        seen.append(cmd)
        return _ok(answers.pop(0))

    monkeypatch.setattr(github_reader.subprocess, "run", fake_run)

    github_reader._fetch_pr_enrichment_graphql(f"1234/{name}", "merged", 500)

    second = seen[1]
    for field in ("owner=1234", f"name={name}", "states[]=MERGED", "cursor=page2"):
        assert field in second, field
        assert second[second.index(field) - 1] == "-f", field


# --- the console says what the PR read missed -------------------------------


def _console_for(tmp_path, monkeypatch, capsys, fetch: PullRequestFetch) -> str:
    from iris import cli

    repo = tmp_path / "repo"
    repo.mkdir()
    _build_repo(repo)
    monkeypatch.setattr(
        cli, "read_pull_requests_with_fallback", lambda *a, **k: fetch,
    )
    args = argparse.Namespace(
        repo_path=str(repo), days=30, churn_days=14, lang="en", recent_days=30,
        verbose=False, trend=False, out=str(tmp_path / "out"), no_push=True,
    )
    cli._run_single_repo(args)
    return capsys.readouterr().out


def test_console_found_prs_with_a_degraded_read_warns(tmp_path, monkeypatch, capsys):
    out = _console_for(tmp_path, monkeypatch, capsys, PullRequestFetch(
        prs=_merged_prs(), degraded=("reviews",)))

    assert "6 PRs found — PR read incomplete (reviews)." in out


def test_console_count_covers_every_pr_state(tmp_path, monkeypatch, capsys):
    out = _console_for(tmp_path, monkeypatch, capsys, PullRequestFetch(
        prs=_merged_prs() + _open_prs(), degraded=()))

    assert "11 PRs found." in out
    assert "merged PRs found" not in out


def test_console_count_does_not_say_merged_in_portuguese():
    from iris.i18n import get_strings

    pt = get_strings("pt-br")

    assert pt["cli_prs_found"].format(count=11) == "11 PRs encontrados."
    assert pt["cli_prs_found_degraded"].format(count=11, steps="reviews") == (
        "11 PRs encontrados — leitura de PR incompleta (reviews)."
    )


def test_console_no_prs_and_only_a_secondary_step_degraded(tmp_path, monkeypatch, capsys):
    out = _console_for(tmp_path, monkeypatch, capsys, PullRequestFetch(
        prs=[], degraded=("enrichment",)))

    assert "no PRs in the window — PR read incomplete (enrichment)." in out
    assert "continuing without PR data" not in out


def test_console_no_prs_and_degraded_basic_keeps_the_failure(tmp_path, monkeypatch, capsys):
    out = _console_for(tmp_path, monkeypatch, capsys, PullRequestFetch(
        prs=[], degraded=("basic", "enrichment")))

    assert "failed (basic, enrichment) — continuing without PR data." in out


# --- a failed enrichment leaves out the origin funnel -----------------------
#
# The funnel's "In PR" stage reads acceptance, which is omitted without the
# enrichment; it would fall back to "every commit is in a PR" and chain that
# into every later conversion.

from iris.analysis.origin_funnel import calculate_origin_funnel


def _commits_with_ai() -> list[Commit]:
    # The funnel needs an origin distribution, which only exists when some
    # commit is AI-assisted or bot-made.
    ai = Commit(hash="c7", author="dev", date=_NOW + timedelta(hours=7),
                message="change 7 (#6)",
                attribution_trailers=["Claude <noreply@anthropic.com>"])
    return _stamped_commits() + [ai]


def test_origin_funnel_is_none_when_enrichment_degraded():
    metrics = aggregate(
        _commits_with_ai(), churn_days=14, prs=_reviewed_prs(),
        pr_fetch_degraded=("enrichment",),
    )

    assert metrics.commit_origin_distribution
    assert calculate_origin_funnel(metrics) is None


@pytest.mark.parametrize("degraded", [("basic",), ("fetch",)])
def test_origin_funnel_is_none_when_the_read_lost_the_prs(degraded):
    # Every state's list failed (`basic`) or the whole read did (`fetch`):
    # there are no PRs, so acceptance is absent and "In PR" would fall back
    # to every commit being in a PR.
    metrics = aggregate(
        _commits_with_ai(), churn_days=14, prs=[], pr_fetch_degraded=degraded,
    )

    assert metrics.commit_origin_distribution
    assert metrics.acceptance_by_origin is None
    assert calculate_origin_funnel(metrics) is None


def test_origin_funnel_keeps_the_default_when_prs_are_absent_by_design():
    # No gh or no GitHub remote: nothing failed, the field is absent.
    metrics = aggregate(_commits_with_ai(), churn_days=14, prs=[])

    assert calculate_origin_funnel(metrics) is not None


def test_origin_funnel_is_kept_on_a_clean_run():
    metrics = aggregate(_commits_with_ai(), churn_days=14, prs=_reviewed_prs())

    assert calculate_origin_funnel(metrics) is not None


def _funnel_in_cli_metrics(tmp_path, monkeypatch, fetch: PullRequestFetch) -> dict:
    from iris import cli

    repo = tmp_path / "repo"
    repo.mkdir()
    _build_repo(repo)
    (repo / "a.py").write_text("x = 99\n", encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-q", "-m",
         "feat: ai change\n\nCo-Authored-By: Claude <noreply@anthropic.com>"],
        cwd=repo, check=True, capture_output=True)
    monkeypatch.setattr(cli, "read_pull_requests_with_fallback", lambda *a, **k: fetch)
    args = argparse.Namespace(
        repo_path=str(repo), days=30, churn_days=14, lang="en", recent_days=30,
        verbose=False, trend=False, out=str(tmp_path / "out"), no_push=True,
    )
    cli._run_single_repo(args)
    return _metrics_json(tmp_path / "out")


def test_cli_metrics_json_has_no_funnel_when_enrichment_degraded(tmp_path, monkeypatch):
    payload = _funnel_in_cli_metrics(
        tmp_path, monkeypatch, PullRequestFetch(prs=[], degraded=("enrichment",)))

    assert "origin_funnel" not in payload


@pytest.mark.parametrize("degraded", [("basic",), ("fetch",)])
def test_cli_metrics_json_has_no_funnel_when_the_read_lost_the_prs(
    tmp_path, monkeypatch, degraded
):
    payload = _funnel_in_cli_metrics(
        tmp_path, monkeypatch, PullRequestFetch(prs=[], degraded=degraded))

    assert "origin_funnel" not in payload


def test_cli_metrics_json_keeps_the_funnel_on_a_clean_run(tmp_path, monkeypatch):
    payload = _funnel_in_cli_metrics(
        tmp_path, monkeypatch, PullRequestFetch(prs=[], degraded=()))

    assert "origin_funnel" in payload
