"""Tests for the multi-window read cache (issue #80).

Runnable as: `python -m pytest tests/test_window_cache.py -v`
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.ingestion import window_cache
from iris.ingestion.github_reader import _finished_before_window


def setup_function():
    window_cache.reset()


def teardown_function():
    window_cache.reset()


def _now():
    return datetime.now(timezone.utc)


# keep(pr, since): a PR belongs in the window if it landed on/after `since`.
def _keep(pr, since):
    return pr.date >= since


def _pr(days_ago):
    return SimpleNamespace(date=_now() - timedelta(days=days_ago))


def test_disabled_by_default_always_loads():
    calls = {"n": 0}

    def load():
        calls["n"] += 1
        return [_pr(1)]

    window_cache.pull_requests("r", 30, load, _keep)
    window_cache.pull_requests("r", 30, load, _keep)
    assert calls["n"] == 2  # no caching while disabled


def test_widest_first_then_slices_in_memory():
    full = [_pr(80), _pr(50), _pr(10), _pr(3)]
    calls = {"n": 0}

    def load():
        calls["n"] += 1
        return full

    window_cache.enable()

    # Widest window: cache miss → load, keeps everything within 90d.
    wide = window_cache.pull_requests("r", 90, load, _keep)
    assert len(wide) == 4
    assert calls["n"] == 1

    # Narrower window: cache hit → slice in memory, no extra load.
    narrow = window_cache.pull_requests("r", 7, load, _keep)
    assert len(narrow) == 1  # only the PR from 3 days ago
    assert calls["n"] == 1


def test_request_wider_than_cache_reloads():
    calls = {"n": 0}

    def load():
        calls["n"] += 1
        return [_pr(5)]

    window_cache.enable()
    window_cache.pull_requests("r", 30, load, _keep)
    window_cache.pull_requests("r", 60, load, _keep)  # 60 > 30 → fresh load
    assert calls["n"] == 2


def test_cache_is_per_repo():
    calls = {"n": 0}

    def load():
        calls["n"] += 1
        return [_pr(2)]

    window_cache.enable()
    window_cache.pull_requests("repo-a", 90, load, _keep)
    window_cache.pull_requests("repo-b", 90, load, _keep)  # different repo
    assert calls["n"] == 2


def test_reset_clears_and_disables():
    calls = {"n": 0}

    def load():
        calls["n"] += 1
        return [_pr(1)]

    window_cache.enable()
    window_cache.pull_requests("r", 90, load, _keep)
    window_cache.reset()
    window_cache.pull_requests("r", 90, load, _keep)  # disabled again → load
    assert calls["n"] == 2


# --- the overlap predicate (single source of truth for the filter) ---------


def test_finished_before_window_drops_old_merged():
    since = _now() - timedelta(days=30)
    merged_old = since - timedelta(days=1)
    assert _finished_before_window(merged_old, None, "merged", since) is True


def test_finished_before_window_keeps_recent_merged():
    since = _now() - timedelta(days=30)
    merged_recent = since + timedelta(days=1)
    assert _finished_before_window(merged_recent, None, "merged", since) is False


def test_finished_before_window_keeps_open_pr():
    since = _now() - timedelta(days=30)
    # Open PR: no merged_at/closed_at → always overlaps.
    assert _finished_before_window(None, None, "open", since) is False


def test_finished_before_window_drops_old_closed():
    since = _now() - timedelta(days=30)
    closed_old = since - timedelta(days=2)
    assert _finished_before_window(None, closed_old, "closed", since) is True
