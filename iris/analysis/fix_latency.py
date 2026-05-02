"""Fix latency — measure how quickly code is reworked, segmented by origin.

Complements the churn calculator by adding a temporal dimension:
instead of binary "churned or not", this measures the actual time
between consecutive file modifications within the churn window.

Key design: origin attribution goes to the **original** commit,
not the rework commit. This answers "does AI code break faster?"
rather than "do humans fix AI code?"

Thresholds:
- Fast rework: < 72h (3 days) — likely obvious issues
- Medium rework: 72-168h (3-7 days) — discovered in production or review
- Slow rework: > 168h (7+ days) — subtle issues or planned iteration
"""

from collections import defaultdict
from datetime import timedelta
from statistics import median

from iris.analysis.origin_classifier import CommitOrigin
from iris.models.commit import Commit
from iris.models.fix_latency import (
    FixLatencyByOrigin,
    FixLatencyResult,
    ReworkEvent,
)

# Latency bucket thresholds in hours.
FAST_THRESHOLD_HOURS = 72.0    # 3 days
MEDIUM_THRESHOLD_HOURS = 168.0  # 7 days

# Minimum rework events per origin to produce per-origin metrics.
MIN_EVENTS_PER_ORIGIN = 10


def calculate_fix_latency(
    commits: list[Commit],
    classified: list[tuple[Commit, CommitOrigin]],
    churn_days: int,
) -> FixLatencyResult | None:
    """Calculate fix latency metrics from commits with origin classification.

    Args:
        commits: All commits sorted by date ascending.
        classified: Origin-classified commits from classify_origins().
        churn_days: Maximum days between modifications to count as rework.

    Returns:
        FixLatencyResult, or None if no rework events found.
    """
    # Build origin lookup: commit hash -> origin
    origin_map: dict[str, str] = {
        c.hash: origin.value for c, origin in classified
    }

    # Build per-file touch history with origin info
    # path -> [(date, commit_hash, origin, lines)]
    file_touches: dict[str, list[tuple]] = defaultdict(list)

    for commit in commits:
        if commit.is_merge:
            continue
        origin = origin_map.get(commit.hash, CommitOrigin.HUMAN.value)
        for fc in commit.files:
            file_touches[fc.path].append((
                commit.date,
                commit.hash,
                origin,
                fc.lines_added + fc.lines_removed,
            ))

    # Find rework events: consecutive modifications within churn window
    window = timedelta(days=churn_days)
    events: list[ReworkEvent] = []

    for path, touches in file_touches.items():
        if len(touches) < 2:
            continue

        # Touches are chronological (commits sorted ascending)
        for i in range(1, len(touches)):
            orig_date, orig_hash, orig_origin, _ = touches[i - 1]
            rework_date, rework_hash, rework_origin, _ = touches[i]

            gap = rework_date - orig_date
            if gap <= window and gap.total_seconds() > 0:
                latency_hours = gap.total_seconds() / 3600
                events.append(ReworkEvent(
                    file_path=path,
                    original_commit_hash=orig_hash,
                    original_date=orig_date,
                    original_origin=orig_origin,
                    rework_commit_hash=rework_hash,
                    rework_date=rework_date,
                    rework_origin=rework_origin,
                    latency_hours=round(latency_hours, 1),
                ))

    if not events:
        return None

    # Aggregate overall metrics
    latencies = sorted(e.latency_hours for e in events)
    fast = sum(1 for h in latencies if h < FAST_THRESHOLD_HOURS)
    medium = sum(1 for h in latencies if FAST_THRESHOLD_HOURS <= h < MEDIUM_THRESHOLD_HOURS)
    slow = sum(1 for h in latencies if h >= MEDIUM_THRESHOLD_HOURS)

    # Per-origin breakdown (grouped by original commit's origin)
    by_origin = _compute_by_origin(events)

    return FixLatencyResult(
        rework_events=events,
        median_latency_hours=round(median(latencies), 1),
        p25_latency_hours=round(_percentile(latencies, 25), 1),
        p75_latency_hours=round(_percentile(latencies, 75), 1),
        fast_rework_count=fast,
        medium_rework_count=medium,
        slow_rework_count=slow,
        by_origin=by_origin,
    )


def _compute_by_origin(events: list[ReworkEvent]) -> list[FixLatencyByOrigin]:
    """Group rework events by original origin and compute per-origin metrics."""
    grouped: dict[str, list[float]] = defaultdict(list)
    for e in events:
        grouped[e.original_origin].append(e.latency_hours)

    results: list[FixLatencyByOrigin] = []
    for origin in [CommitOrigin.HUMAN.value, CommitOrigin.AI_ASSISTED.value, CommitOrigin.BOT.value]:
        latencies = grouped.get(origin, [])
        if len(latencies) < MIN_EVENTS_PER_ORIGIN:
            continue
        fast = sum(1 for h in latencies if h < FAST_THRESHOLD_HOURS)
        results.append(FixLatencyByOrigin(
            origin=origin,
            median_latency_hours=round(median(latencies), 1),
            fast_rework_pct=round(fast / len(latencies) * 100, 1),
            rework_count=len(latencies),
        ))

    return results


def _percentile(sorted_data: list[float], pct: int) -> float:
    """Compute percentile from pre-sorted data without numpy."""
    if not sorted_data:
        return 0.0
    k = (len(sorted_data) - 1) * pct / 100
    f = int(k)
    c = f + 1
    if c >= len(sorted_data):
        return sorted_data[f]
    d = k - f
    return sorted_data[f] + d * (sorted_data[c] - sorted_data[f])
