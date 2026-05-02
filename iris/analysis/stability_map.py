"""Stability map — per-directory aggregation of stabilization and churn metrics.

Groups file-level stabilization and churn data by directory to produce a
map of stable vs volatile areas in the repository. Useful as empirical
input for Knowledge Priming documents.

Design decisions:
- Default depth: 2 levels (e.g. src/payments/, lib/services/)
- Minimum 3 files touched per directory to appear in the map
- Directories are derived from file paths in commits, not filesystem scans
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta

from iris.models.commit import Commit


@dataclass(frozen=True)
class DirectoryMetrics:
    """Stability metrics for a single directory."""

    directory: str
    files_touched: int
    files_stabilized: int
    stabilization_ratio: float
    churn_events: int
    total_lines_changed: int


@dataclass(frozen=True)
class StabilityMapResult:
    """Complete stability map for a repository."""

    directories: list[DirectoryMetrics]
    stable_dirs: list[DirectoryMetrics]     # stabilization >= 80%
    volatile_dirs: list[DirectoryMetrics]   # stabilization < 50%


# Minimum files touched per directory to appear in the map.
MIN_FILES_PER_DIR = 3

# Default directory depth for aggregation.
DEFAULT_DEPTH = 2

# Thresholds for classifying directories.
STABLE_THRESHOLD = 0.80
VOLATILE_THRESHOLD = 0.50


def calculate_stability_map(
    commits: list[Commit],
    churn_days: int,
    depth: int = DEFAULT_DEPTH,
) -> StabilityMapResult | None:
    """Calculate per-directory stabilization and churn metrics.

    Args:
        commits: Commits sorted by date ascending.
        churn_days: Churn/stabilization window in days.
        depth: Directory depth for aggregation (default: 2).

    Returns:
        StabilityMapResult with per-directory breakdown.
        None if no directories meet the minimum file threshold.
    """
    # Group file modification dates and line changes by directory
    dir_file_dates: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    dir_file_lines: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for commit in commits:
        for fc in commit.files:
            directory = _truncate_path(fc.path, depth)
            if not directory:
                continue
            dir_file_dates[directory][fc.path].append(commit.date)
            dir_file_lines[directory][fc.path] += fc.lines_added + fc.lines_removed

    window = timedelta(days=churn_days)
    directories: list[DirectoryMetrics] = []

    for directory in sorted(dir_file_dates.keys()):
        file_dates = dir_file_dates[directory]
        files_touched = len(file_dates)

        if files_touched < MIN_FILES_PER_DIR:
            continue

        files_stabilized = 0
        churn_events = 0

        for path, dates in file_dates.items():
            if len(dates) == 1:
                files_stabilized += 1
                continue

            dates_sorted = sorted(dates)

            # Stabilization: no consecutive pair within churn window
            is_stable = True
            has_churn = False
            for i in range(1, len(dates_sorted)):
                if dates_sorted[i] - dates_sorted[i - 1] <= window:
                    is_stable = False
                    has_churn = True
                    break

            if is_stable:
                files_stabilized += 1
            if has_churn:
                churn_events += 1

        ratio = files_stabilized / files_touched if files_touched > 0 else 1.0
        total_lines = sum(dir_file_lines[directory].values())

        directories.append(DirectoryMetrics(
            directory=directory,
            files_touched=files_touched,
            files_stabilized=files_stabilized,
            stabilization_ratio=round(ratio, 3),
            churn_events=churn_events,
            total_lines_changed=total_lines,
        ))

    if not directories:
        return None

    # Sort by stabilization ratio ascending (most volatile first)
    directories.sort(key=lambda d: d.stabilization_ratio)

    stable = [d for d in directories if d.stabilization_ratio >= STABLE_THRESHOLD]
    volatile = [d for d in directories if d.stabilization_ratio < VOLATILE_THRESHOLD]

    return StabilityMapResult(
        directories=directories,
        stable_dirs=sorted(stable, key=lambda d: -d.stabilization_ratio),
        volatile_dirs=sorted(volatile, key=lambda d: d.stabilization_ratio),
    )


def _truncate_path(file_path: str, depth: int) -> str:
    """Extract the directory prefix at the given depth.

    Examples (depth=2):
        "src/payments/processor.py" -> "src/payments"
        "README.md" -> ""  (root-level file, no directory)
        "src/config.py" -> "src"  (only 1 level deep)
        "a/b/c/d.py" -> "a/b"
    """
    parts = file_path.split("/")

    # Root-level files have no directory
    if len(parts) <= 1:
        return ""

    # Take up to `depth` directory parts (excluding filename)
    dir_parts = parts[:-1]  # remove filename
    truncated = dir_parts[:depth]
    return "/".join(truncated)
