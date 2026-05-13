"""Tests for the Flow Efficiency analysis module.

Runnable as: `python -m pytest tests/test_flow_efficiency.py -v`
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.analysis.flow_efficiency import (
    analyze_flow_efficiency,
    compute_pr_phases,
    _active_duration,
)
from iris.models.pull_request import CommitRef, PRReview, PullRequest


_BASE = datetime(2026, 4, 1, 0, 0, tzinfo=timezone.utc)


def _pr(
    *,
    number: int = 1,
    title: str = "feat: ship it",
    opened_offset_hours: float = 0.0,
    merged_offset_hours: float = 24.0,
    first_commit_offset_hours: float = -2.0,
    review_offsets_hours: list[float] | None = None,
    review_states: list[str] | None = None,
    extra_commit_offsets_hours: list[float] | None = None,
    state: str = "merged",
) -> PullRequest:
    """Build a PR with explicit timing for phase tests."""
    opened_at = _BASE + timedelta(hours=opened_offset_hours)
    merged_at = _BASE + timedelta(hours=merged_offset_hours)
    first_commit = _BASE + timedelta(hours=first_commit_offset_hours)

    refs = [CommitRef(hash=f"{number}a", committed_at=first_commit)]
    for off in extra_commit_offsets_hours or []:
        refs.append(CommitRef(hash=f"{number}b{off}", committed_at=_BASE + timedelta(hours=off)))

    reviews: list[PRReview] = []
    offsets = review_offsets_hours or []
    states = review_states or ["COMMENTED"] * len(offsets)
    for off, st in zip(offsets, states):
        reviews.append(PRReview(
            author="reviewer",
            state=st,
            submitted_at=_BASE + timedelta(hours=off),
        ))

    return PullRequest(
        number=number,
        title=title,
        author="alice",
        created_at=opened_at,
        merged_at=merged_at if state == "merged" else None,
        state=state,  # type: ignore[arg-type]
        additions=0,
        deletions=0,
        changed_files=0,
        reviews=reviews,
        commit_refs=refs,
    )


# ---------------------------------------------------------------------------
# compute_pr_phases
# ---------------------------------------------------------------------------


def test_returns_none_for_non_merged_pr():
    pr = _pr(state="open")
    assert compute_pr_phases(pr) is None


def test_returns_none_when_no_commit_timestamps():
    pr = _pr()
    # Strip the commit timestamp to simulate older payloads.
    object.__setattr__(
        pr.commit_refs[0],  # type: ignore[arg-type]
        "committed_at",
        None,
    )
    assert compute_pr_phases(pr) is None


def test_phase_split_with_reviews_and_approval():
    pr = _pr(
        first_commit_offset_hours=-4,
        opened_offset_hours=0,
        review_offsets_hours=[6, 10],
        review_states=["COMMENTED", "APPROVED"],
        merged_offset_hours=12,
    )
    phases = compute_pr_phases(pr, active_threshold_hours=4)
    assert phases is not None
    # Coding: 4h before opening
    assert phases.coding == 4 * 3600
    # Awaiting first review: opening (0h) → first review (6h) = 6h
    assert phases.awaiting_first_review == 6 * 3600
    # In review: first review (6h) → approval (10h) = 4h total
    # Events inside [6h, 10h]: review at 6h, review at 10h (10h sits at end)
    # The 6h review marks [6h, 10h] active (capped to phase_end)
    # → in_review_active = 4h, in_review_wait = 0
    assert phases.in_review_active == 4 * 3600
    assert phases.in_review_wait == 0
    # Awaiting merge: 10h → 12h = 2h
    assert phases.awaiting_merge == 2 * 3600
    assert phases.had_first_review is True


def test_phase_no_reviews_treats_entire_post_open_as_wait():
    pr = _pr(
        first_commit_offset_hours=-1,
        opened_offset_hours=0,
        merged_offset_hours=5,
        review_offsets_hours=None,
    )
    phases = compute_pr_phases(pr)
    assert phases is not None
    assert phases.coding == 1 * 3600
    assert phases.awaiting_first_review == 5 * 3600
    assert phases.in_review_active == 0
    assert phases.in_review_wait == 0
    assert phases.awaiting_merge == 0
    assert phases.had_first_review is False
    assert phases.efficiency < 0.2  # mostly wait


def test_phase_no_approval_extends_in_review_to_merge():
    pr = _pr(
        first_commit_offset_hours=-1,
        opened_offset_hours=0,
        review_offsets_hours=[2],
        review_states=["COMMENTED"],
        merged_offset_hours=10,
    )
    phases = compute_pr_phases(pr, active_threshold_hours=4)
    assert phases is not None
    # In review spans [2h, 10h] = 8h; event at 2h marks [2h, 6h] active.
    assert phases.in_review_active == 4 * 3600
    assert phases.in_review_wait == 4 * 3600
    assert phases.awaiting_merge == 0


# ---------------------------------------------------------------------------
# _active_duration heuristic
# ---------------------------------------------------------------------------


def test_active_duration_unions_overlapping_event_windows():
    phase_start = _BASE
    phase_end = _BASE + timedelta(hours=10)
    events = [
        _BASE + timedelta(hours=1),  # claims 1-5
        _BASE + timedelta(hours=3),  # claims 3-7 (overlaps)
        _BASE + timedelta(hours=8),  # claims 8-12, clamped to 8-10
    ]
    active = _active_duration(
        events, phase_start=phase_start, phase_end=phase_end, threshold_hours=4
    )
    # Union: [1h, 7h] (6h) + [8h, 10h] (2h) = 8h
    assert active == 8 * 3600


def test_active_duration_zero_when_no_events_inside_phase():
    phase_start = _BASE
    phase_end = _BASE + timedelta(hours=2)
    events = [_BASE + timedelta(hours=10)]  # way after phase
    assert _active_duration(
        events, phase_start=phase_start, phase_end=phase_end, threshold_hours=4
    ) == 0


# ---------------------------------------------------------------------------
# analyze_flow_efficiency aggregates
# ---------------------------------------------------------------------------


def _busy_pr(n: int, intent: str = "feat") -> PullRequest:
    """Helper: a fast, well-flowing PR contributing high efficiency."""
    titles = {"feat": "feat: x", "fix": "fix: x", "refactor": "refactor: x"}
    return _pr(
        number=n,
        title=titles[intent],
        first_commit_offset_hours=-2,
        opened_offset_hours=0,
        review_offsets_hours=[1, 2],
        review_states=["COMMENTED", "APPROVED"],
        merged_offset_hours=3,
    )


def test_returns_none_when_no_pr_survives_filter():
    # All open PRs → none produce phases
    assert analyze_flow_efficiency([_pr(state="open"), _pr(state="open")]) is None


def test_aggregates_basic_shape():
    prs = [_busy_pr(i, "feat") for i in range(5)]
    result = analyze_flow_efficiency(prs)
    assert result is not None
    assert 0.0 <= result.flow_efficiency_median <= 1.0
    assert result.pr_count == 5
    assert result.median_time_to_first_review_hours == 1.0  # 1h after open
    # All 5 PRs are "feat" → only one intent group; below min_sample=10, so empty
    assert result.flow_efficiency_by_intent == {}


def test_by_intent_respects_min_sample():
    prs = [_busy_pr(i, "feat") for i in range(10)] + [_busy_pr(100 + i, "fix") for i in range(3)]
    result = analyze_flow_efficiency(prs, min_sample=10)
    assert result is not None
    assert "FEATURE" in result.flow_efficiency_by_intent
    assert "FIX" not in result.flow_efficiency_by_intent  # only 3 PRs


def test_by_origin_uses_majority_rule():
    # PR #1: 2 commits both AI_ASSISTED → AI
    pr1 = _busy_pr(1)
    object.__setattr__(pr1, "commit_refs", [
        CommitRef(hash="a1", committed_at=_BASE - timedelta(hours=2)),
        CommitRef(hash="a2", committed_at=_BASE - timedelta(hours=1)),
    ])
    # PR #2: 2 commits both HUMAN → HUMAN
    pr2 = _busy_pr(2)
    object.__setattr__(pr2, "commit_refs", [
        CommitRef(hash="h1", committed_at=_BASE - timedelta(hours=2)),
        CommitRef(hash="h2", committed_at=_BASE - timedelta(hours=1)),
    ])
    origin_map = {
        "a1": "AI_ASSISTED", "a2": "AI_ASSISTED",
        "h1": "HUMAN", "h2": "HUMAN",
    }
    # Need >= min_sample. Drop the default by passing a smaller threshold.
    result = analyze_flow_efficiency([pr1, pr2], commit_origin_map=origin_map, min_sample=1)
    assert result is not None
    assert "AI_ASSISTED" in result.flow_efficiency_by_origin
    assert "HUMAN" in result.flow_efficiency_by_origin


def test_drops_pr_below_min_elapsed():
    # Instant merge (1 minute elapsed) — should be filtered.
    pr = _pr(
        first_commit_offset_hours=-1 / 60,
        opened_offset_hours=0,
        merged_offset_hours=1 / 60,  # 1 min later
    )
    # min_elapsed default 5 min → filtered → no surviving PR → None
    assert analyze_flow_efficiency([pr]) is None
