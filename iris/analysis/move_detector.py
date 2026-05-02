"""Moved code detection — identify refactoring via cross-file code movement.

Detects when lines deleted from one file appear as additions in another
file within the same commit, indicating code movement (refactoring).
This is a positive quality signal — GitClear's 2025 research found moved
code dropped from 24% to 9.5% of operations since AI tools proliferated.

Key metrics:
- moved_code_pct: % of changed lines that were moved between files
- refactoring_ratio: moved / (moved + duplicated) — health index
- All segmented by origin (HUMAN, AI_ASSISTED)
"""

# AGGREGATOR_OPT_OUT: consumes diff reads + duplicate_detector output.
# Lives in the same post-hoc diff-analysis chain as duplicate_detector.
# Consumers: iris/cli.py (Step 4d)

import hashlib
from collections import defaultdict
from dataclasses import dataclass
from statistics import median

from iris.analysis.duplicate_detector import DuplicateResult
from iris.analysis.origin_classifier import CommitOrigin
from iris.ingestion.diff_reader import CommitDiff, _is_trivial_line
from iris.models.commit import Commit


@dataclass(frozen=True)
class MoveByOrigin:
    """Move detection metrics for a single origin."""

    origin: str
    commits_analyzed: int
    commits_with_moves: int
    moved_lines: int
    total_changed_lines: int
    moved_code_pct: float


@dataclass(frozen=True)
class MoveResult:
    """Complete moved code analysis."""

    commits_analyzed: int
    commits_with_moves: int
    total_moved_lines: int
    moved_code_pct: float
    refactoring_ratio: float | None  # moved / (moved + duplicated)
    by_origin: list[MoveByOrigin]


# Minimum contiguous lines to count as a "moved block".
MIN_MOVED_BLOCK_SIZE = 3

# Skip files with too many lines to avoid O(n^2).
MAX_LINES_PER_FILE = 500

# Minimum commits per origin for per-origin stats.
MIN_COMMITS_PER_ORIGIN = 10


def detect_moves(
    commit_diffs: list[CommitDiff],
    origin_classified: list[tuple[Commit, CommitOrigin]],
    duplicate_result: DuplicateResult | None = None,
) -> MoveResult | None:
    """Detect moved code blocks across files within commits.

    For each commit with 2+ modified files, compares removed lines from
    file A against added lines in file B. A "moved block" is 3+
    consecutive lines deleted from one file and added to another,
    with whitespace normalization.

    Args:
        commit_diffs: Parsed diffs from diff_reader.
        origin_classified: Pre-classified (commit, origin) pairs.
        duplicate_result: Optional — used to compute refactoring_ratio.

    Returns:
        MoveResult with movement metrics, or None if insufficient data.
    """
    if not commit_diffs:
        return None

    origin_map = {c.hash: origin.value for c, origin in origin_classified}

    # Per-origin tracking
    origin_analyzed: dict[str, int] = defaultdict(int)
    origin_with_moves: dict[str, int] = defaultdict(int)
    origin_moved_lines: dict[str, int] = defaultdict(int)
    origin_total_lines: dict[str, int] = defaultdict(int)

    total_analyzed = 0
    total_with_moves = 0
    total_moved = 0
    total_changed = 0

    for diff in commit_diffs:
        if len(diff.file_diffs) < 2:
            continue

        origin = origin_map.get(diff.commit_hash, CommitOrigin.HUMAN.value)
        total_analyzed += 1
        origin_analyzed[origin] += 1

        # Compute total changed lines for this commit
        commit_changed = sum(
            len(fd.added_lines) + len(fd.removed_lines)
            for fd in diff.file_diffs
        )
        total_changed += commit_changed
        origin_total_lines[origin] += commit_changed

        # Build per-file normalized removed/added lines
        file_removed: dict[str, list[str]] = {}
        file_added: dict[str, list[str]] = {}

        for fd in diff.file_diffs:
            if len(fd.removed_lines) > MAX_LINES_PER_FILE:
                continue
            if len(fd.added_lines) > MAX_LINES_PER_FILE:
                continue

            removed = [
                _normalize(line) for line in fd.removed_lines
                if not _is_trivial_line(line)
            ]
            added = [
                _normalize(line) for line in fd.added_lines
                if not _is_trivial_line(line)
            ]

            if removed:
                file_removed[fd.path] = removed
            if added:
                file_added[fd.path] = added

        # Find moved blocks: removed from file A, added in file B
        moved_lines = _find_moved_lines(file_removed, file_added)

        if moved_lines > 0:
            total_with_moves += 1
            total_moved += moved_lines
            origin_with_moves[origin] += 1
            origin_moved_lines[origin] += moved_lines

    if total_analyzed == 0 or total_changed == 0:
        return None

    # Compute refactoring_ratio if duplicate data available
    refactoring_ratio = None
    if duplicate_result is not None:
        # Estimate total duplicated lines from block count * median size
        dup_lines = 0
        if duplicate_result.total_duplicate_blocks > 0:
            dup_lines = int(
                duplicate_result.total_duplicate_blocks
                * duplicate_result.median_duplicate_block_size
            )
        denominator = total_moved + dup_lines
        if denominator > 0:
            refactoring_ratio = round(total_moved / denominator, 3)

    # Build per-origin breakdown
    by_origin: list[MoveByOrigin] = []
    for origin in [CommitOrigin.HUMAN.value, CommitOrigin.AI_ASSISTED.value]:
        analyzed = origin_analyzed.get(origin, 0)
        if analyzed < MIN_COMMITS_PER_ORIGIN:
            continue

        moved = origin_moved_lines.get(origin, 0)
        changed = origin_total_lines.get(origin, 0)

        by_origin.append(MoveByOrigin(
            origin=origin,
            commits_analyzed=analyzed,
            commits_with_moves=origin_with_moves.get(origin, 0),
            moved_lines=moved,
            total_changed_lines=changed,
            moved_code_pct=round(moved / changed, 3) if changed > 0 else 0,
        ))

    return MoveResult(
        commits_analyzed=total_analyzed,
        commits_with_moves=total_with_moves,
        total_moved_lines=total_moved,
        moved_code_pct=round(total_moved / total_changed, 3) if total_changed > 0 else 0,
        refactoring_ratio=refactoring_ratio,
        by_origin=by_origin,
    )


def _normalize(line: str) -> str:
    """Normalize a line for comparison: strip and collapse whitespace."""
    return " ".join(line.split())


def _find_moved_lines(
    file_removed: dict[str, list[str]],
    file_added: dict[str, list[str]],
) -> int:
    """Find lines moved between files. Returns total moved line count."""
    total_moved = 0
    seen_hashes: set[str] = set()

    for path_r, removed in file_removed.items():
        if len(removed) < MIN_MOVED_BLOCK_SIZE:
            continue

        # Build sliding windows from removed lines
        windows_r = _build_windows(removed)

        for path_a, added in file_added.items():
            if path_a == path_r:
                continue  # same file = update, not move
            if len(added) < MIN_MOVED_BLOCK_SIZE:
                continue

            windows_a = _build_windows(added)

            # Find matching windows
            common = set(windows_r.keys()) & set(windows_a.keys())
            for window_hash in common:
                if window_hash in seen_hashes:
                    continue
                seen_hashes.add(window_hash)

                idx_r = windows_r[window_hash]
                idx_a = windows_a[window_hash]
                block_size = _extend_match(removed, added, idx_r, idx_a)
                total_moved += block_size

    return total_moved


def _build_windows(lines: list[str]) -> dict[str, int]:
    """Build hash -> start_index map for sliding windows."""
    windows: dict[str, int] = {}
    for i in range(len(lines) - MIN_MOVED_BLOCK_SIZE + 1):
        window = tuple(lines[i:i + MIN_MOVED_BLOCK_SIZE])
        h = hashlib.md5("\n".join(window).encode()).hexdigest()
        if h not in windows:
            windows[h] = i
    return windows


def _extend_match(
    lines_a: list[str],
    lines_b: list[str],
    start_a: int,
    start_b: int,
) -> int:
    """Extend a match beyond MIN_MOVED_BLOCK_SIZE, return total block size."""
    size = MIN_MOVED_BLOCK_SIZE
    ia = start_a + MIN_MOVED_BLOCK_SIZE
    ib = start_b + MIN_MOVED_BLOCK_SIZE

    while ia < len(lines_a) and ib < len(lines_b):
        if lines_a[ia] != lines_b[ib]:
            break
        size += 1
        ia += 1
        ib += 1

    return size
