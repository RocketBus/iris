"""Churn calculation — detects files modified repeatedly within a short window.

Definition of "churn event":
  A file is considered churning if it was modified in 2 or more commits
  within the churn window (--churn-days). This is a proxy for corrective
  effort — files that need repeated changes may indicate unstable or
  incorrect initial implementations.

Assumption:
  Churn is measured using a sliding window approach. For each file, we look
  at the dates of all commits that touch it and count whether any pair of
  modifications falls within the churn window.

  v0 uses a simpler approach: group all file modifications within the
  analysis period, and flag files touched >= 2 times where the time
  between first and last touch is <= churn_days.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta

from iris.models.commit import Commit


@dataclass(frozen=True)
class ChurnResult:
    """Result of churn analysis."""

    churn_events: int
    churn_lines_affected: int
    churning_files: list[str]


def calculate_churn(commits: list[Commit], churn_days: int) -> ChurnResult:
    """Calculate churn metrics from a list of commits.

    A file is a "churn event" if it was modified in 2+ commits and has
    modifications spanning no more than churn_days apart (i.e., rapid
    re-editing).

    Args:
        commits: List of Commit objects (sorted by date ascending).
        churn_days: Maximum days between modifications to count as churn.

    Returns:
        ChurnResult with counts and affected file list.
    """
    # Group: file_path -> list of (date, lines_added, lines_removed)
    file_touches: dict[str, list[tuple]] = defaultdict(list)

    for commit in commits:
        for fc in commit.files:
            file_touches[fc.path].append((
                commit.date,
                fc.lines_added,
                fc.lines_removed,
            ))

    window = timedelta(days=churn_days)
    churning_files = []
    total_churn_lines = 0

    for path, touches in sorted(file_touches.items()):
        if len(touches) < 2:
            continue

        # Check if any two consecutive touches are within the churn window
        # Touches are already in chronological order (commits sorted ascending)
        has_churn = False
        for i in range(1, len(touches)):
            if touches[i][0] - touches[i - 1][0] <= window:
                has_churn = True
                break

        if has_churn:
            churning_files.append(path)
            for _, added, removed in touches:
                total_churn_lines += added + removed

    return ChurnResult(
        churn_events=len(churning_files),
        churn_lines_affected=total_churn_lines,
        churning_files=churning_files,
    )
