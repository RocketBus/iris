"""Tests for the Merge Strategy detection module.

Runnable as: `python -m pytest tests/test_merge_strategy_detector.py -v`
"""

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.analysis.merge_strategy_detector import (
    MIN_CLASSIFIED_PRS,
    detect_merge_strategy,
    _squash_pr_numbers,
)
from iris.models.commit import Commit
from iris.models.pull_request import CommitRef, PullRequest

_NOW = datetime(2026, 5, 1, tzinfo=timezone.utc)


def _merged_pr(
    number: int,
    *,
    refs: tuple[str, ...] = (),
    parent_count: int | None = None,
    state: str = "merged",
) -> PullRequest:
    return PullRequest(
        number=number,
        title=f"PR {number}",
        author="alice",
        created_at=_NOW,
        additions=0,
        deletions=0,
        changed_files=0,
        merged_at=_NOW if state == "merged" else None,
        closed_at=_NOW if state in ("merged", "closed") else None,
        state=state,
        commit_refs=[CommitRef(hash=h) for h in refs],
        merge_commit_sha=f"merge{number}",
        merge_commit_parent_count=parent_count,
    )


def _commit(h: str, message: str = "") -> Commit:
    return Commit(hash=h, author="alice", message=message)


# ---------------------------------------------------------------------------
# Ground truth: 2-parent merge commit
# ---------------------------------------------------------------------------


def test_two_parent_merge_commit_classifies_as_merge():
    prs = [_merged_pr(i, parent_count=2) for i in range(1, 7)]
    result = detect_merge_strategy(prs, commits=[])
    assert result.merge_strategy == "merge"
    assert result.dominant_share == 1.0
    assert result.commit_metrics_reliable is True


# ---------------------------------------------------------------------------
# Commit-ref presence heuristic
# ---------------------------------------------------------------------------


def test_all_refs_present_in_main_is_merge():
    # Each PR's single commit landed verbatim on main.
    prs = [_merged_pr(i, refs=(f"c{i}",), parent_count=1) for i in range(1, 7)]
    commits = [_commit(f"c{i}") for i in range(1, 7)]
    result = detect_merge_strategy(prs, commits)
    assert result.merge_strategy == "merge"
    assert result.commit_metrics_reliable is True


def test_single_absent_ref_is_squash():
    # One original commit, absent from main (collapsed/rewritten) → squash.
    prs = [_merged_pr(i, refs=(f"orig{i}",), parent_count=1) for i in range(1, 7)]
    result = detect_merge_strategy(prs, commits=[])
    assert result.merge_strategy == "squash"
    assert result.dominant_share == 1.0
    assert result.commit_metrics_reliable is False


def test_squash_subject_stamp_corroborates_multi_commit_squash():
    # Multi-commit PRs whose refs are absent but whose number is stamped on a
    # main subject "(#N)" — the GitHub squash default → squash.
    prs = [
        _merged_pr(i, refs=(f"a{i}", f"b{i}", f"c{i}"), parent_count=1)
        for i in range(1, 7)
    ]
    commits = [_commit(f"landed{i}", f"feat: thing (#{i})") for i in range(1, 7)]
    result = detect_merge_strategy(prs, commits)
    assert result.merge_strategy == "squash"
    assert result.commit_metrics_reliable is False


def test_multiple_absent_refs_without_stamp_is_rebase():
    # N original commits, none present, no squash stamp → replayed → rebase.
    prs = [
        _merged_pr(i, refs=(f"a{i}", f"b{i}", f"c{i}"), parent_count=1)
        for i in range(1, 7)
    ]
    result = detect_merge_strategy(prs, commits=[])
    assert result.merge_strategy == "rebase"
    # Rebase preserves commit count — not flagged unreliable.
    assert result.commit_metrics_reliable is True


# ---------------------------------------------------------------------------
# Aggregation: mixed / unknown thresholds
# ---------------------------------------------------------------------------


def test_split_strategies_is_mixed_and_unreliable():
    # 3 merge (2-parent) + 3 squash (single absent ref) → 50/50 → mixed.
    prs = [_merged_pr(i, parent_count=2) for i in range(1, 4)]
    prs += [_merged_pr(i, refs=(f"orig{i}",), parent_count=1) for i in range(4, 7)]
    result = detect_merge_strategy(prs, commits=[])
    assert result.merge_strategy == "mixed"
    assert result.dominant_share == 0.5
    assert result.commit_metrics_reliable is False


def test_below_min_classified_is_unknown():
    prs = [_merged_pr(i, parent_count=2) for i in range(1, MIN_CLASSIFIED_PRS)]
    result = detect_merge_strategy(prs, commits=[])
    assert result.merge_strategy == "unknown"
    assert result.dominant_share is None
    # Unknown never flags reliability — we don't claim what we can't determine.
    assert result.commit_metrics_reliable is True
    assert result.reason is not None


def test_no_merged_prs_is_unknown():
    prs = [_merged_pr(1, state="open"), _merged_pr(2, state="closed")]
    result = detect_merge_strategy(prs, commits=[])
    assert result.merge_strategy == "unknown"
    assert result.classified_pr_count == 0
    assert "no merged PRs" in (result.reason or "")


def test_open_and_closed_prs_are_ignored():
    # 5 merged squash + noise from non-merged PRs that must not be counted.
    prs = [_merged_pr(i, refs=(f"orig{i}",), parent_count=1) for i in range(1, 6)]
    prs += [_merged_pr(99, parent_count=2, state="open")]
    prs += [_merged_pr(98, parent_count=2, state="closed")]
    result = detect_merge_strategy(prs, commits=[])
    assert result.merge_strategy == "squash"
    assert result.classified_pr_count == 5


# ---------------------------------------------------------------------------
# Subject-stamp parsing
# ---------------------------------------------------------------------------


def test_squash_pr_numbers_extracts_trailing_stamp_only():
    commits = [
        _commit("a", "fix(navbar): something (#71)"),
        _commit("b", "feat: add metric (#56)"),
        _commit("c", "chore: no stamp here"),
        _commit("d", "refs #999 mid-message, not trailing"),
    ]
    assert _squash_pr_numbers(commits) == {71, 56}
