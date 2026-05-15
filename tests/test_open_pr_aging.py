"""Tests for the Open PR Aging analysis module.

Runnable as: `python -m pytest tests/test_open_pr_aging.py -v`
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.analysis.open_pr_aging import (
    ABANDONMENT_DAYS,
    STALE_DAYS,
    VERY_STALE_DAYS,
    analyze_open_pr_aging,
)
from iris.models.pull_request import CommitRef, PRReview, PullRequest


_NOW = datetime(2026, 5, 14, 12, 0, tzinfo=timezone.utc)


def _open_pr(
    *,
    number: int = 1,
    title: str = "feat: ship it",
    author: str = "alice",
    age_days: int = 1,
    last_activity_days_ago: int | None = None,
    is_draft: bool = False,
    commit_hashes: tuple[str, ...] = (),
) -> PullRequest:
    """Build an OPEN PR with explicit age and last-activity timing.

    ``last_activity_days_ago`` defaults to ``age_days`` (= no activity
    after open). To simulate fresh activity, pass a smaller value.
    """
    created_at = _NOW - timedelta(days=age_days)
    if last_activity_days_ago is None:
        last_activity_days_ago = age_days

    reviews: list[PRReview] = []
    refs: list[CommitRef] = []
    if last_activity_days_ago < age_days:
        # A single review marks the most recent activity.
        reviews.append(
            PRReview(
                author="reviewer",
                state="COMMENTED",
                submitted_at=_NOW - timedelta(days=last_activity_days_ago),
            )
        )
    for h in commit_hashes:
        refs.append(CommitRef(hash=h, committed_at=created_at))

    return PullRequest(
        number=number,
        title=title,
        author=author,
        created_at=created_at,
        merged_at=None,
        closed_at=None,
        state="open",
        is_draft=is_draft,
        additions=0,
        deletions=0,
        changed_files=0,
        reviews=reviews,
        commit_refs=refs,
    )


# ---------------------------------------------------------------------------
# Empty / filtered cases — None
# ---------------------------------------------------------------------------


def test_returns_none_when_no_prs():
    assert analyze_open_pr_aging([], now=_NOW) is None


def test_returns_none_when_all_filtered_out():
    prs = [
        _open_pr(number=1, is_draft=True),
        _open_pr(number=2, author="dependabot[bot]"),
        _open_pr(number=3, author="renovate"),
    ]
    assert analyze_open_pr_aging(prs, now=_NOW) is None


def test_excludes_merged_and_closed_prs():
    open_pr = _open_pr(number=1, age_days=5)
    merged = _open_pr(number=2, age_days=5)
    object.__setattr__(merged, "state", "merged")
    object.__setattr__(merged, "merged_at", _NOW - timedelta(days=2))
    closed = _open_pr(number=3, age_days=5)
    object.__setattr__(closed, "state", "closed")
    object.__setattr__(closed, "closed_at", _NOW - timedelta(days=2))

    result = analyze_open_pr_aging([open_pr, merged, closed], now=_NOW)
    assert result is not None
    assert result.open_pr_count == 1


# ---------------------------------------------------------------------------
# Filtering — drafts and bots
# ---------------------------------------------------------------------------


def test_drafts_excluded():
    prs = [
        _open_pr(number=1, age_days=10),
        _open_pr(number=2, age_days=10, is_draft=True),
    ]
    result = analyze_open_pr_aging(prs, now=_NOW)
    assert result is not None
    assert result.open_pr_count == 1


def test_bots_excluded():
    prs = [
        _open_pr(number=1, age_days=10, author="alice"),
        _open_pr(number=2, age_days=10, author="dependabot[bot]"),
        _open_pr(number=3, age_days=10, author="renovate-bot"),
        _open_pr(number=4, age_days=10, author="kody-ai"),
    ]
    result = analyze_open_pr_aging(prs, now=_NOW)
    assert result is not None
    assert result.open_pr_count == 1


# ---------------------------------------------------------------------------
# Aging math
# ---------------------------------------------------------------------------


def test_age_uses_created_at_and_now():
    prs = [_open_pr(age_days=7)]
    result = analyze_open_pr_aging(prs, now=_NOW)
    assert result is not None
    assert result.median_open_pr_age_days == 7.0
    assert result.p90_open_pr_age_days == 7.0


def test_last_activity_uses_max_of_review_and_commit():
    # PR created 30d ago, but with a review 3d ago → inactivity = 3, not 30
    pr = _open_pr(age_days=30, last_activity_days_ago=3)
    result = analyze_open_pr_aging([pr], now=_NOW)
    assert result is not None
    # 3 days < STALE_DAYS, so stale_pct must be 0
    assert result.stale_open_pr_pct == 0.0
    assert result.median_open_pr_age_days == 30.0


def test_stale_threshold_inclusive():
    # 14 days inactive should count as stale (>= STALE_DAYS).
    pr = _open_pr(age_days=STALE_DAYS, last_activity_days_ago=STALE_DAYS)
    result = analyze_open_pr_aging([pr], now=_NOW)
    assert result is not None
    assert result.stale_open_pr_pct == 1.0


def test_thresholds_are_nested():
    # Each PR should count toward every threshold it crosses.
    prs = [
        _open_pr(number=1, age_days=ABANDONMENT_DAYS),  # crosses all three
        _open_pr(number=2, age_days=VERY_STALE_DAYS),   # crosses stale + very_stale
        _open_pr(number=3, age_days=STALE_DAYS),         # crosses stale only
        _open_pr(number=4, age_days=1),                  # fresh
    ]
    result = analyze_open_pr_aging(prs, now=_NOW)
    assert result is not None
    assert result.open_pr_count == 4
    assert result.stale_open_pr_pct == 0.75
    assert result.very_stale_open_pr_pct == 0.5
    assert result.abandonment_risk_pct == 0.25


def test_p90_with_outlier():
    # 9 PRs at age 1 + 1 PR at age 100 → median ≈ 1, p90 closer to ~10ish
    prs = [_open_pr(number=i, age_days=1) for i in range(9)]
    prs.append(_open_pr(number=99, age_days=100))
    result = analyze_open_pr_aging(prs, now=_NOW)
    assert result is not None
    assert result.median_open_pr_age_days == 1.0
    assert result.p90_open_pr_age_days > 1.0


# ---------------------------------------------------------------------------
# Quebras secundárias — min_sample
# ---------------------------------------------------------------------------


def test_by_intent_respects_min_sample():
    # 4 features (below default min_sample=5) — should be omitted.
    prs = [
        _open_pr(number=i, title="feat: x", age_days=10) for i in range(4)
    ]
    result = analyze_open_pr_aging(prs, now=_NOW)
    assert result is not None
    assert result.median_open_pr_age_by_intent == {}


def test_by_intent_emitted_when_sample_meets_threshold():
    prs = [
        _open_pr(number=i, title="feat: x", age_days=10) for i in range(5)
    ]
    result = analyze_open_pr_aging(prs, now=_NOW)
    assert result is not None
    assert "FEATURE" in result.median_open_pr_age_by_intent


def test_by_origin_skipped_when_origin_map_absent():
    prs = [_open_pr(number=i, age_days=10) for i in range(6)]
    result = analyze_open_pr_aging(prs, now=_NOW)
    assert result is not None
    assert result.stale_open_pr_pct_by_origin == {}


def test_by_origin_segments_below_min_sample_omitted():
    # 6 PRs: 5 HUMAN (commit "h*"), 1 AI_ASSISTED (commit "a*")
    prs = [
        _open_pr(number=i, age_days=20, commit_hashes=(f"h{i}",))
        for i in range(5)
    ]
    prs.append(_open_pr(number=99, age_days=20, commit_hashes=("a1",)))
    origin_map = {f"h{i}": "HUMAN" for i in range(5)}
    origin_map["a1"] = "AI_ASSISTED"
    result = analyze_open_pr_aging(prs, now=_NOW, commit_origin_map=origin_map)
    assert result is not None
    # HUMAN has 5 PRs → reported; AI_ASSISTED has 1 → omitted (< min_sample=5)
    assert "HUMAN" in result.stale_open_pr_pct_by_origin
    assert "AI_ASSISTED" not in result.stale_open_pr_pct_by_origin


# ---------------------------------------------------------------------------
# Smoke — sane shape
# ---------------------------------------------------------------------------


def test_result_shape_is_well_formed():
    prs = [_open_pr(number=i, age_days=i + 1) for i in range(10)]
    result = analyze_open_pr_aging(prs, now=_NOW)
    assert result is not None
    assert isinstance(result.open_pr_count, int)
    assert isinstance(result.median_open_pr_age_days, float)
    assert 0.0 <= result.stale_open_pr_pct <= 1.0
    assert 0.0 <= result.very_stale_open_pr_pct <= 1.0
    assert 0.0 <= result.abandonment_risk_pct <= 1.0
    assert result.very_stale_open_pr_pct <= result.stale_open_pr_pct
    assert result.abandonment_risk_pct <= result.very_stale_open_pr_pct
