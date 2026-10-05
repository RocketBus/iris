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
