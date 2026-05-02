"""Origin-aware metrics — distribution, churn, and stabilization by origin.

Computes per-origin breakdowns by reusing existing analysis functions
(calculate_churn, calculate_stabilization) on origin-grouped commits.
"""

from collections import defaultdict

from iris.analysis.churn_calculator import ChurnResult, calculate_churn
from iris.analysis.origin_classifier import CommitOrigin, classify_origins
from iris.metrics.stabilization import StabilizationResult, calculate_stabilization
from iris.models.commit import Commit


def compute_origin_distribution(
    classified: list[tuple[Commit, CommitOrigin]],
) -> dict[str, int]:
    """Compute commit counts per origin.

    Args:
        classified: List of (commit, origin) from classify_origins.

    Returns:
        Dict mapping origin name to commit count.
    """
    counts: dict[str, int] = {o.value: 0 for o in CommitOrigin}
    for _commit, origin in classified:
        counts[origin.value] += 1
    return counts


def compute_churn_by_origin(
    classified: list[tuple[Commit, CommitOrigin]],
    churn_days: int,
) -> dict[str, ChurnResult]:
    """Compute churn metrics per origin.

    Groups commits by origin and runs calculate_churn on each group.

    Args:
        classified: List of (commit, origin).
        churn_days: Churn window in days.

    Returns:
        Dict mapping origin name to ChurnResult.
    """
    grouped = _group_by_origin(classified)
    results: dict[str, ChurnResult] = {}

    for origin in CommitOrigin:
        key = origin.value
        commits = grouped.get(key, [])
        if commits:
            results[key] = calculate_churn(commits, churn_days)
        else:
            results[key] = ChurnResult(
                churn_events=0,
                churn_lines_affected=0,
                churning_files=[],
            )

    return results


def compute_stabilization_by_origin(
    classified: list[tuple[Commit, CommitOrigin]],
    churn_days: int,
) -> dict[str, StabilizationResult]:
    """Compute stabilization ratio per origin.

    Groups commits by origin and runs calculate_stabilization on each group.

    Args:
        classified: List of (commit, origin).
        churn_days: Churn window in days.

    Returns:
        Dict mapping origin name to StabilizationResult.
    """
    grouped = _group_by_origin(classified)
    results: dict[str, StabilizationResult] = {}

    for origin in CommitOrigin:
        key = origin.value
        commits = grouped.get(key, [])
        if commits:
            results[key] = calculate_stabilization(commits, churn_days)
        else:
            results[key] = StabilizationResult(
                files_touched=0,
                files_stabilized=0,
                stabilization_ratio=1.0,
            )

    return results


def _group_by_origin(
    classified: list[tuple[Commit, CommitOrigin]],
) -> dict[str, list[Commit]]:
    """Group classified commits by origin, extracting the raw Commit objects."""
    grouped: dict[str, list[Commit]] = defaultdict(list)
    for commit, origin in classified:
        grouped[origin.value].append(commit)
    return grouped
