"""Operation classifier — classify the operation mix of commits.

Provides a lightweight version of GitClear's 7-operation taxonomy,
classifying each commit's changes into: added, deleted, moved,
duplicated, and updated lines.

This combines diff content analysis with results from the duplicate
detector and move detector to build a complete picture of how code
changes are distributed across operation types.

Key metrics:
- operation_distribution: % breakdown by operation type
- dominant_operation: most common operation type
- All segmented by origin (HUMAN, AI_ASSISTED)
"""

# AGGREGATOR_OPT_OUT: consumes DuplicateResult + MoveResult from the post-hoc chain.
# Ordered after its upstream modules; cannot run in the aggregator pass.
# Consumers: iris/cli.py (Step 4d)

from collections import defaultdict
from dataclasses import dataclass

from iris.analysis.duplicate_detector import DuplicateResult
from iris.analysis.move_detector import MoveResult
from iris.analysis.origin_classifier import CommitOrigin
from iris.ingestion.diff_reader import CommitDiff
from iris.models.commit import Commit


@dataclass(frozen=True)
class OperationMix:
    """Operation breakdown for a set of commits."""

    pct_added: float       # net new lines
    pct_deleted: float     # net removed lines
    pct_moved: float       # lines moved between files
    pct_duplicated: float  # lines duplicated across files
    pct_updated: float     # lines updated in place (same file add+remove)
    dominant_operation: str


@dataclass(frozen=True)
class OperationByOrigin:
    """Operation classification for a single origin."""

    origin: str
    mix: OperationMix
    commits_analyzed: int


@dataclass(frozen=True)
class OperationResult:
    """Complete operation classification analysis."""

    overall: OperationMix
    by_origin: list[OperationByOrigin]
    commits_analyzed: int


# Minimum thresholds.
MIN_COMMITS_FOR_ANALYSIS = 10
MIN_COMMITS_PER_ORIGIN = 10


def classify_operations(
    commits: list[Commit],
    commit_diffs: list[CommitDiff],
    origin_classified: list[tuple[Commit, CommitOrigin]],
    duplicate_result: DuplicateResult | None = None,
    move_result: MoveResult | None = None,
) -> OperationResult | None:
    """Classify the operation mix of commits.

    Combines numstat data with diff content and results from the
    duplicate and move detectors.

    Args:
        commits: Commits with numstat data.
        commit_diffs: Parsed diffs from diff_reader.
        origin_classified: Pre-classified (commit, origin) pairs.
        duplicate_result: Optional duplicate detection results.
        move_result: Optional move detection results.

    Returns:
        OperationResult with operation mix, or None if insufficient data.
    """
    if not commit_diffs or len(commit_diffs) < MIN_COMMITS_FOR_ANALYSIS:
        return None

    origin_map = {c.hash: origin.value for c, origin in origin_classified}
    diff_map = {d.commit_hash: d for d in commit_diffs}

    # Per-origin accumulators
    origin_totals: dict[str, dict[str, int]] = defaultdict(
        lambda: {"added": 0, "deleted": 0, "updated": 0, "moved": 0, "duplicated": 0}
    )
    origin_commit_counts: dict[str, int] = defaultdict(int)
    overall = {"added": 0, "deleted": 0, "updated": 0, "moved": 0, "duplicated": 0}
    analyzed = 0

    # Process each commit
    for commit in commits:
        if commit.is_merge or not commit.files:
            continue

        diff = diff_map.get(commit.hash)
        if diff is None:
            continue

        origin = origin_map.get(commit.hash, CommitOrigin.HUMAN.value)
        analyzed += 1
        origin_commit_counts[origin] += 1

        # Get total added/removed from numstat
        total_added = sum(fc.lines_added for fc in commit.files)
        total_removed = sum(fc.lines_removed for fc in commit.files)

        # Estimate "updated" lines from diff: within same file,
        # lines in hunks with both adds and removes.
        updated = _estimate_updates(diff)

        # Net added = total added - updated (updates appear as both add+remove)
        net_added = max(0, total_added - updated)
        net_deleted = max(0, total_removed - updated)

        overall["added"] += net_added
        overall["deleted"] += net_deleted
        overall["updated"] += updated
        origin_totals[origin]["added"] += net_added
        origin_totals[origin]["deleted"] += net_deleted
        origin_totals[origin]["updated"] += updated

    if analyzed < MIN_COMMITS_FOR_ANALYSIS:
        return None

    # Distribute moved and duplicated lines proportionally by origin
    total_all_lines = sum(overall.values())
    if total_all_lines == 0:
        return None

    # Add global moved/duplicated estimates
    if move_result is not None and move_result.total_moved_lines > 0:
        moved = move_result.total_moved_lines
        # Subtract moved from added (moved lines appear as add in dest)
        subtract = min(moved, overall["added"])
        overall["added"] -= subtract
        overall["moved"] = moved

        # Distribute by origin
        for mo in move_result.by_origin:
            origin_moved = mo.moved_lines
            origin_sub = min(origin_moved, origin_totals[mo.origin]["added"])
            origin_totals[mo.origin]["added"] -= origin_sub
            origin_totals[mo.origin]["moved"] += origin_moved

    if duplicate_result is not None and duplicate_result.total_duplicate_blocks > 0:
        dup_lines = int(
            duplicate_result.total_duplicate_blocks
            * duplicate_result.median_duplicate_block_size
        )
        # Subtract duplicated from added
        subtract = min(dup_lines, overall["added"])
        overall["added"] -= subtract
        overall["duplicated"] = dup_lines

        # Distribute by origin
        for do in duplicate_result.by_origin:
            origin_dup = int(do.total_duplicate_blocks * do.median_block_size)
            origin_sub = min(origin_dup, origin_totals[do.origin]["added"])
            origin_totals[do.origin]["added"] -= origin_sub
            origin_totals[do.origin]["duplicated"] += origin_dup

    # Build overall mix
    overall_mix = _build_mix(overall)

    # Build per-origin mixes
    by_origin: list[OperationByOrigin] = []
    for origin in [CommitOrigin.HUMAN.value, CommitOrigin.AI_ASSISTED.value]:
        count = origin_commit_counts.get(origin, 0)
        if count < MIN_COMMITS_PER_ORIGIN:
            continue
        by_origin.append(OperationByOrigin(
            origin=origin,
            mix=_build_mix(origin_totals[origin]),
            commits_analyzed=count,
        ))

    return OperationResult(
        overall=overall_mix,
        by_origin=by_origin,
        commits_analyzed=analyzed,
    )


def _estimate_updates(diff: CommitDiff) -> int:
    """Estimate number of updated lines from diff content.

    Within each file, count lines where both additions and removals
    exist. The minimum of (added, removed) in each file is an estimate
    of "updated" lines (line-level modifications rather than pure adds).
    """
    total_updates = 0
    for fd in diff.file_diffs:
        if fd.added_lines and fd.removed_lines:
            total_updates += min(len(fd.added_lines), len(fd.removed_lines))
    return total_updates


def _build_mix(totals: dict[str, int]) -> OperationMix:
    """Build an OperationMix from raw line counts."""
    grand_total = sum(totals.values())
    if grand_total == 0:
        return OperationMix(
            pct_added=0, pct_deleted=0, pct_moved=0,
            pct_duplicated=0, pct_updated=0,
            dominant_operation="unknown",
        )

    pcts = {k: round(v / grand_total, 3) for k, v in totals.items()}

    # Determine dominant operation
    dominant = max(totals, key=lambda k: totals[k])

    return OperationMix(
        pct_added=pcts.get("added", 0),
        pct_deleted=pcts.get("deleted", 0),
        pct_moved=pcts.get("moved", 0),
        pct_duplicated=pcts.get("duplicated", 0),
        pct_updated=pcts.get("updated", 0),
        dominant_operation=dominant,
    )
