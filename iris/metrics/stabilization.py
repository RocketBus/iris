"""Stabilization ratio — measures delivery durability.

A file is "stabilized" if, after its last modification within the analysis
window, it was NOT modified again within the churn window (churn_days).

This is the core signal/noise proxy in Iris:
  - High stabilization ratio (~1.0) → changes persist → delivery signal
  - Low stabilization ratio (~0.0) → changes rewritten → engineering noise

Assumption:
  We define stabilization relative to the analysis window. A file's last
  modification date is compared against subsequent modifications. If no
  subsequent modification occurs within churn_days of the last touch,
  the file is considered stabilized.

  For files touched near the end of the analysis window, we may not have
  enough data to confirm stabilization. v0 accepts this limitation.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta

from iris.models.commit import Commit


@dataclass(frozen=True)
class StabilizationResult:
    """Result of stabilization analysis."""

    files_touched: int
    files_stabilized: int
    stabilization_ratio: float


def calculate_stabilization(
    commits: list[Commit],
    churn_days: int,
) -> StabilizationResult:
    """Calculate how many files stabilized after being modified.

    A file is stabilized if the gap between any consecutive modifications
    is always > churn_days, OR if it was only touched once.

    Args:
        commits: Commits sorted by date ascending.
        churn_days: Window in days to check for re-modification.

    Returns:
        StabilizationResult with file counts and ratio.
    """
    # Collect all modification dates per file
    file_dates: dict[str, list] = defaultdict(list)

    for commit in commits:
        for fc in commit.files:
            file_dates[fc.path].append(commit.date)

    window = timedelta(days=churn_days)
    files_touched = len(file_dates)
    files_stabilized = 0

    for path, dates in file_dates.items():
        if len(dates) == 1:
            # Only touched once — considered stabilized
            files_stabilized += 1
            continue

        dates_sorted = sorted(dates)
        # File is stabilized if NO consecutive pair is within the churn window
        is_stable = True
        for i in range(1, len(dates_sorted)):
            if dates_sorted[i] - dates_sorted[i - 1] <= window:
                is_stable = False
                break

        if is_stable:
            files_stabilized += 1

    ratio = files_stabilized / files_touched if files_touched > 0 else 1.0

    return StabilizationResult(
        files_touched=files_touched,
        files_stabilized=files_stabilized,
        stabilization_ratio=ratio,
    )
