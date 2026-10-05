"""Tests for the PR-read degradation signal (issue #236).

When a step of the GitHub PR read fails, the engine used to fall back to
partial data without saying so: two runs on the same commit could disagree on
merge strategy and flow metrics with nothing in the output explaining why.
These tests pin the signal from where it starts to where it is reported.

Runnable as: `python -m pytest tests/test_pr_fetch_degradation.py -v`
"""

import sys
from pathlib import Path

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
