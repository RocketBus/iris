"""Duplicate block detection — find identical code across files within commits.

Detects when 5+ contiguous non-trivial lines appear in multiple files
within the same commit. This is a direct signal of copy-paste development,
which GitClear's 2025 research found increased 8x between 2022-2024.

Key metrics:
- duplicate_block_rate: % of commits containing duplicate blocks
- total_duplicate_blocks: total blocks found
- median_duplicate_block_size: typical block length
- All segmented by origin (HUMAN, AI_ASSISTED)
"""

# AGGREGATOR_OPT_OUT: requires per-commit diff reads via diff_reader (heavy I/O).
# Aggregator operates on commit metadata only; diff-based analyses stay post-hoc.
# Consumers: iris/cli.py (Step 4d)

import hashlib
from collections import defaultdict
from dataclasses import dataclass, field
from statistics import median

from iris.analysis.origin_classifier import CommitOrigin
from iris.ingestion.diff_reader import CommitDiff, _is_trivial_line
from iris.models.commit import Commit


@dataclass(frozen=True)
class DuplicateByOrigin:
    """Duplicate metrics for a single origin."""

    origin: str
    commits_analyzed: int
    commits_with_duplicates: int
    duplicate_rate: float
    total_duplicate_blocks: int
    median_block_size: float


@dataclass(frozen=True)
class DuplicateByTool:
    """Duplicate metrics for a specific AI tool."""

    tool: str
    commits_analyzed: int
    commits_with_duplicates: int
    duplicate_rate: float
    total_duplicate_blocks: int
    median_block_size: float


@dataclass(frozen=True)
class DuplicateResult:
    """Complete duplicate block analysis."""

    commits_analyzed: int
    commits_with_duplicates: int
    duplicate_block_rate: float
    total_duplicate_blocks: int
    median_duplicate_block_size: float
    by_origin: list[DuplicateByOrigin]
    by_tool: list[DuplicateByTool] = field(default_factory=list)


# Minimum contiguous identical lines to count as a duplicate block.
MIN_BLOCK_SIZE = 5

# Skip files with too many added lines (avoid O(n^2) blowup).
MAX_ADDED_LINES_PER_FILE = 500

# Minimum commits per origin to report per-origin stats.
MIN_COMMITS_PER_ORIGIN = 10


def detect_duplicates(
    commit_diffs: list[CommitDiff],
    origin_classified: list[tuple[Commit, CommitOrigin]],
    tool_map: dict[str, str] | None = None,
) -> DuplicateResult | None:
    """Detect duplicate code blocks across files within commits.

    For each commit with 2+ modified files, extracts added lines per file
    and finds contiguous blocks of MIN_BLOCK_SIZE+ identical lines
    appearing in multiple files. Trivial lines are excluded.

    Args:
        commit_diffs: Parsed diffs from diff_reader.
        origin_classified: Pre-classified (commit, origin) pairs.
        tool_map: Optional commit hash -> tool name mapping from build_tool_map().

    Returns:
        DuplicateResult with block metrics, or None if insufficient data.
    """
    if not commit_diffs:
        return None

    origin_map = {c.hash: origin.value for c, origin in origin_classified}

    # Per-origin tracking
    origin_analyzed: dict[str, int] = defaultdict(int)
    origin_with_dups: dict[str, int] = defaultdict(int)
    origin_blocks: dict[str, int] = defaultdict(int)
    origin_block_sizes: dict[str, list[int]] = defaultdict(list)

    # Per-tool tracking
    tool_analyzed: dict[str, int] = defaultdict(int)
    tool_with_dups: dict[str, int] = defaultdict(int)
    tool_blocks: dict[str, int] = defaultdict(int)
    tool_block_sizes: dict[str, list[int]] = defaultdict(list)

    total_analyzed = 0
    total_with_dups = 0
    all_block_sizes: list[int] = []

    for diff in commit_diffs:
        # Only analyze commits with 2+ files
        if len(diff.file_diffs) < 2:
            continue

        origin = origin_map.get(diff.commit_hash, CommitOrigin.HUMAN.value)
        tool = tool_map.get(diff.commit_hash) if tool_map else None
        total_analyzed += 1
        origin_analyzed[origin] += 1
        if tool:
            tool_analyzed[tool] += 1

        # Build per-file non-trivial added lines
        file_lines: dict[str, list[str]] = {}
        for fd in diff.file_diffs:
            if len(fd.added_lines) > MAX_ADDED_LINES_PER_FILE:
                continue
            non_trivial = [
                line.strip() for line in fd.added_lines
                if not _is_trivial_line(line)
            ]
            if len(non_trivial) >= MIN_BLOCK_SIZE:
                file_lines[fd.path] = non_trivial

        if len(file_lines) < 2:
            continue

        # Find duplicate blocks across file pairs
        blocks = _find_duplicate_blocks(file_lines)

        if blocks:
            total_with_dups += 1
            origin_with_dups[origin] += 1
            origin_blocks[origin] += len(blocks)
            if tool:
                tool_with_dups[tool] += 1
                tool_blocks[tool] += len(blocks)
            for size in blocks:
                all_block_sizes.append(size)
                origin_block_sizes[origin].append(size)
                if tool:
                    tool_block_sizes[tool].append(size)

    if total_analyzed == 0:
        return None

    # Build per-origin breakdown
    by_origin: list[DuplicateByOrigin] = []
    for origin in [CommitOrigin.HUMAN.value, CommitOrigin.AI_ASSISTED.value]:
        analyzed = origin_analyzed.get(origin, 0)
        if analyzed < MIN_COMMITS_PER_ORIGIN:
            continue

        with_dups = origin_with_dups.get(origin, 0)
        blocks = origin_blocks.get(origin, 0)
        sizes = origin_block_sizes.get(origin, [])

        by_origin.append(DuplicateByOrigin(
            origin=origin,
            commits_analyzed=analyzed,
            commits_with_duplicates=with_dups,
            duplicate_rate=round(with_dups / analyzed, 3),
            total_duplicate_blocks=blocks,
            median_block_size=round(median(sizes), 1) if sizes else 0,
        ))

    # Build per-tool breakdown
    by_tool: list[DuplicateByTool] = []
    if tool_map:
        for tool in sorted(tool_analyzed.keys()):
            analyzed = tool_analyzed[tool]
            if analyzed < MIN_COMMITS_PER_ORIGIN:
                continue

            with_dups = tool_with_dups.get(tool, 0)
            blocks = tool_blocks.get(tool, 0)
            sizes = tool_block_sizes.get(tool, [])

            by_tool.append(DuplicateByTool(
                tool=tool,
                commits_analyzed=analyzed,
                commits_with_duplicates=with_dups,
                duplicate_rate=round(with_dups / analyzed, 3),
                total_duplicate_blocks=blocks,
                median_block_size=round(median(sizes), 1) if sizes else 0,
            ))

    return DuplicateResult(
        commits_analyzed=total_analyzed,
        commits_with_duplicates=total_with_dups,
        duplicate_block_rate=round(total_with_dups / total_analyzed, 3),
        total_duplicate_blocks=len(all_block_sizes),
        median_duplicate_block_size=round(median(all_block_sizes), 1) if all_block_sizes else 0,
        by_origin=by_origin,
        by_tool=by_tool,
    )


def _find_duplicate_blocks(file_lines: dict[str, list[str]]) -> list[int]:
    """Find duplicate blocks across files. Returns list of block sizes."""
    files = list(file_lines.items())
    found_blocks: list[int] = []
    seen_hashes: set[str] = set()

    for i in range(len(files)):
        path_a, lines_a = files[i]
        # Build sliding windows for file A
        windows_a = _build_windows(lines_a)

        for j in range(i + 1, len(files)):
            path_b, lines_b = files[j]
            windows_b = _build_windows(lines_b)

            # Find matching windows
            common = set(windows_a.keys()) & set(windows_b.keys())
            for window_hash in common:
                # Deduplicate: don't count the same block content twice
                if window_hash in seen_hashes:
                    continue
                seen_hashes.add(window_hash)

                # Try to extend the match beyond MIN_BLOCK_SIZE
                idx_a = windows_a[window_hash]
                idx_b = windows_b[window_hash]
                block_size = _extend_match(lines_a, lines_b, idx_a, idx_b)
                found_blocks.append(block_size)

    return found_blocks


def _build_windows(lines: list[str]) -> dict[str, int]:
    """Build hash -> start_index map for sliding windows of MIN_BLOCK_SIZE."""
    windows: dict[str, int] = {}
    for i in range(len(lines) - MIN_BLOCK_SIZE + 1):
        window = tuple(lines[i:i + MIN_BLOCK_SIZE])
        h = hashlib.md5("\n".join(window).encode()).hexdigest()
        if h not in windows:  # keep first occurrence
            windows[h] = i
    return windows


def _extend_match(
    lines_a: list[str],
    lines_b: list[str],
    start_a: int,
    start_b: int,
) -> int:
    """Extend a match beyond MIN_BLOCK_SIZE, return total block size."""
    size = MIN_BLOCK_SIZE
    ia = start_a + MIN_BLOCK_SIZE
    ib = start_b + MIN_BLOCK_SIZE

    while ia < len(lines_a) and ib < len(lines_b):
        if lines_a[ia] != lines_b[ib]:
            break
        size += 1
        ia += 1
        ib += 1

    return size
