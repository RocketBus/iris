"""Intent-aware metrics — distribution, churn, and stabilization by intent.

Computes per-intent breakdowns by reusing existing analysis functions
(calculate_churn, calculate_stabilization) on intent-grouped commits.
"""

from collections import defaultdict
from dataclasses import dataclass

from iris.analysis.churn_calculator import ChurnResult, calculate_churn
from iris.metrics.stabilization import StabilizationResult, calculate_stabilization
from iris.models.intent import ChangeIntent, ClassifiedCommit


@dataclass(frozen=True)
class IntentDistribution:
    """Commit distribution by engineering intent."""

    counts: dict[str, int]
    percentages: dict[str, float]
    lines_changed: dict[str, int]


def compute_intent_distribution(
    classified: list[ClassifiedCommit],
) -> IntentDistribution:
    """Compute commit counts, percentages, and lines changed per intent.

    Args:
        classified: Classified commits from intent_classifier.

    Returns:
        IntentDistribution with all intents represented (zeros for missing).
    """
    counts: dict[str, int] = {i.value: 0 for i in ChangeIntent}
    lines: dict[str, int] = {i.value: 0 for i in ChangeIntent}

    for cc in classified:
        key = cc.intent.value
        counts[key] += 1
        for fc in cc.commit.files:
            lines[key] += fc.lines_added + fc.lines_removed

    total = len(classified)
    percentages: dict[str, float] = {
        k: round(v / total, 2) if total > 0 else 0.0
        for k, v in counts.items()
    }

    return IntentDistribution(
        counts=counts,
        percentages=percentages,
        lines_changed=lines,
    )


def compute_churn_by_intent(
    classified: list[ClassifiedCommit],
    churn_days: int,
) -> dict[str, ChurnResult]:
    """Compute churn metrics per intent.

    Groups commits by intent and runs calculate_churn on each group.

    Args:
        classified: Classified commits.
        churn_days: Churn window in days.

    Returns:
        Dict mapping intent name to ChurnResult.
    """
    grouped = _group_by_intent(classified)
    results: dict[str, ChurnResult] = {}

    for intent_name in ChangeIntent:
        key = intent_name.value
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


def compute_stabilization_by_intent(
    classified: list[ClassifiedCommit],
    churn_days: int,
) -> dict[str, StabilizationResult]:
    """Compute stabilization ratio per intent.

    Groups commits by intent and runs calculate_stabilization on each group.

    Args:
        classified: Classified commits.
        churn_days: Churn window in days.

    Returns:
        Dict mapping intent name to StabilizationResult.
    """
    grouped = _group_by_intent(classified)
    results: dict[str, StabilizationResult] = {}

    for intent_name in ChangeIntent:
        key = intent_name.value
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


def _group_by_intent(
    classified: list[ClassifiedCommit],
) -> dict[str, list]:
    """Group classified commits by intent, extracting the raw Commit objects."""
    grouped: dict[str, list] = defaultdict(list)
    for cc in classified:
        grouped[cc.intent.value].append(cc.commit)
    return grouped
