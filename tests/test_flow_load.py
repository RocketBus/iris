"""Tests for the Flow Load analysis module.

Runnable as: `python -m pytest tests/test_flow_load.py -v`
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.analysis.flow_load import analyze_flow_load
from iris.models.commit import Commit
from iris.models.pull_request import PullRequest


# A fixed Monday so ISO-week math is easy to reason about.
_MONDAY_W18 = datetime(2026, 4, 27, 12, 0, tzinfo=timezone.utc)  # 2026-W18


def _pr(
    number: int,
    *,
    title: str = "feat: new thing",
    created_offset_days: int = 0,
    merged_offset_days: int | None = None,
    closed_offset_days: int | None = None,
    state: str = "merged",
) -> PullRequest:
    return PullRequest(
        number=number,
        title=title,
        author="alice",
        created_at=_MONDAY_W18 + timedelta(days=created_offset_days),
        merged_at=(_MONDAY_W18 + timedelta(days=merged_offset_days))
            if merged_offset_days is not None else None,
        closed_at=(_MONDAY_W18 + timedelta(days=closed_offset_days))
            if closed_offset_days is not None else None,
        state=state,  # type: ignore[arg-type]
        additions=0,
        deletions=0,
        changed_files=0,
    )


def _commit(author: str, email: str, day_offset: int) -> Commit:
    return Commit(
        hash=f"{author}-{day_offset}",
        author=author,
        author_email=email,
        date=_MONDAY_W18 + timedelta(days=day_offset),
        message="some change",
    )


# ---------------------------------------------------------------------------
# Basic shape
# ---------------------------------------------------------------------------


def test_returns_none_for_empty_input():
    assert analyze_flow_load([], []) is None


def test_requires_at_least_two_buckets():
    # Single PR opened and merged in the same week → only one bucket.
    prs = [_pr(1, created_offset_days=0, merged_offset_days=2)]
    assert analyze_flow_load(prs, []) is None


def test_rejects_unsupported_bucket_granularity():
    try:
        analyze_flow_load([], [], bucket="month")
    except ValueError as exc:
        assert "month" in str(exc)
    else:
        raise AssertionError("expected ValueError")


# ---------------------------------------------------------------------------
# WIP counting
# ---------------------------------------------------------------------------


def test_wip_includes_pr_overlapping_bucket_even_if_merged_later():
    # PR opened in W18, merged in W19 → counts in both weeks.
    prs = [_pr(1, created_offset_days=0, merged_offset_days=8)]
    result = analyze_flow_load(prs, [])
    assert result is not None
    assert len(result.buckets) == 2
    assert result.buckets[0].wip_total == 1
    assert result.buckets[1].wip_total == 1


def test_wip_excludes_pr_that_merged_before_bucket_start():
    # PR1 opened day 0, merged day 1 (W18).
    # PR2 opened day 8 (W19) — so PR1 is gone by W19.
    prs = [
        _pr(1, created_offset_days=0, merged_offset_days=1),
        _pr(2, created_offset_days=8, merged_offset_days=10),
    ]
    result = analyze_flow_load(prs, [])
    assert result is not None
    by_bucket = {b.bucket: b for b in result.buckets}
    w18 = by_bucket["2026-W18"]
    w19 = by_bucket["2026-W19"]
    assert w18.wip_total == 1
    assert w19.wip_total == 1


def test_wip_counts_open_pr_in_every_subsequent_bucket():
    # PR opened 14 days before, still open → counts in 3 weeks (W16, W17, W18).
    prs = [_pr(1, created_offset_days=-14, state="open")]
    # Force a second non-PR signal so we get >=2 buckets even if the PR
    # itself only spans some weeks.
    commits = [_commit("a", "a@x.com", 0)]
    result = analyze_flow_load(prs, commits)
    assert result is not None
    assert all(b.wip_total == 1 for b in result.buckets)


def test_wip_excludes_pr_closed_before_bucket():
    # Closed-without-merge in W16; window covers W17 onward only if forced.
    prs = [
        _pr(1, created_offset_days=-14, closed_offset_days=-12, state="closed"),
        _pr(2, created_offset_days=0, merged_offset_days=1, state="merged"),
    ]
    result = analyze_flow_load(prs, [])
    assert result is not None
    by_bucket = {b.bucket: b for b in result.buckets}
    # W16: PR1 is open then closed in W16 → counts in W16.
    # W17: PR1 closed before W17, so 0. PR2 not created yet, so 0.
    # W18: PR2 alive.
    assert by_bucket["2026-W18"].wip_total == 1
    # Verify the closed-before-window exclusion: the bucket containing only
    # the gap week is 0.
    if "2026-W17" in by_bucket:
        assert by_bucket["2026-W17"].wip_total == 0


# ---------------------------------------------------------------------------
# Intent breakdown
# ---------------------------------------------------------------------------


def test_wip_by_intent_classifies_pr_titles():
    prs = [
        _pr(1, title="feat: ship onboarding", created_offset_days=0, merged_offset_days=8),
        _pr(2, title="fix: stop crash on logout", created_offset_days=0, merged_offset_days=8),
        _pr(3, title="refactor: extract helper", created_offset_days=0, merged_offset_days=8),
        _pr(4, title="just some words", created_offset_days=0, merged_offset_days=8),
    ]
    result = analyze_flow_load(prs, [])
    assert result is not None
    w18 = next(b for b in result.buckets if b.bucket == "2026-W18")
    assert w18.wip_total == 4
    assert w18.wip_by_intent.get("FEATURE", 0) == 1
    assert w18.wip_by_intent.get("FIX", 0) == 1
    assert w18.wip_by_intent.get("REFACTOR", 0) == 1
    assert w18.wip_by_intent.get("UNKNOWN", 0) == 1


# ---------------------------------------------------------------------------
# Author concurrency
# ---------------------------------------------------------------------------


def test_author_concurrency_counts_distinct_emails():
    commits = [
        _commit("Alice", "alice@x.com", 0),
        _commit("Alice", "alice@x.com", 1),  # same email — same author
        _commit("Bob", "bob@x.com", 1),
        _commit("Carol", "carol@x.com", 8),  # next week
    ]
    # Add one PR so we have enough buckets without relying on commit weeks
    prs = [_pr(1, created_offset_days=0, merged_offset_days=8)]
    result = analyze_flow_load(prs, commits)
    assert result is not None
    by_bucket = {b.bucket: b for b in result.buckets}
    assert by_bucket["2026-W18"].author_concurrency == 2
    assert by_bucket["2026-W19"].author_concurrency == 1


def test_author_concurrency_ignores_merge_commits():
    commits = [
        Commit(
            hash="m1",
            author="Alice",
            author_email="alice@x.com",
            date=_MONDAY_W18,
            is_merge=True,
            message="Merge branch",
        ),
        _commit("Bob", "bob@x.com", 0),
    ]
    prs = [_pr(1, created_offset_days=0, merged_offset_days=8)]
    result = analyze_flow_load(prs, commits)
    assert result is not None
    w18 = next(b for b in result.buckets if b.bucket == "2026-W18")
    assert w18.author_concurrency == 1
