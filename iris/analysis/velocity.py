"""Velocity analysis — measure delivery speed and correlate with durability.

Divides the analysis period into time windows and computes velocity
(commits/week, lines/week) for each. Optionally correlates velocity
with stabilization to answer: "are we going faster without breaking?"

Design choices:
- Window size defaults to 14 days (2 weeks) to smooth daily noise.
- Trend detection uses first-half vs second-half comparison (no scipy).
- Correlation uses directional agreement between velocity and stabilization trends.
- Minimum 20 commits required for meaningful velocity analysis.
"""

# AGGREGATOR_OPT_OUT: produces its own time-windowed dataclass rendered as a separate report section.
# Kept alongside adoption/trend outputs that follow the post-aggregation pattern.
# Consumers: iris/cli.py (Step 5c), iris/reports/writer.py

from collections import defaultdict
from datetime import timedelta

from iris.models.commit import Commit
from iris.models.velocity import (
    VelocityDurabilityPoint,
    VelocityResult,
    VelocityWindow,
)

# Minimum commits to produce velocity analysis.
MIN_COMMITS_FOR_VELOCITY = 20

# Default window size in days.
DEFAULT_WINDOW_DAYS = 14

# Minimum windows required for trend detection.
MIN_WINDOWS_FOR_TREND = 3

# Velocity change threshold for trend classification.
TREND_THRESHOLD_PCT = 15.0  # ±15% → stable


def compute_velocity(
    commits: list[Commit],
    window_days: int = DEFAULT_WINDOW_DAYS,
    churn_days: int = 14,
) -> VelocityResult | None:
    """Compute velocity metrics over time windows.

    Args:
        commits: All commits sorted by date ascending.
        window_days: Size of each time window in days.
        churn_days: Churn window for per-window stabilization.

    Returns:
        VelocityResult, or None if insufficient data.
    """
    if len(commits) < MIN_COMMITS_FOR_VELOCITY:
        return None

    # Determine time range
    start_date = commits[0].date
    end_date = commits[-1].date
    total_span = end_date - start_date
    total_weeks = max(total_span.total_seconds() / (7 * 86400), 1)

    # Build windows
    windows = _build_windows(commits, start_date, end_date, window_days)

    if not windows:
        return None

    # Overall velocity
    total_lines = sum(
        fc.lines_added + fc.lines_removed
        for c in commits for fc in c.files
    )
    overall_cpw = len(commits) / total_weeks
    overall_lpw = total_lines / total_weeks

    # Trend: compare first half vs second half of windows
    velocity_trend, velocity_change_pct = _compute_trend(windows)

    # Velocity-durability correlation
    correlation_points = _compute_durability_points(
        commits, start_date, end_date, window_days, churn_days,
    )
    correlation_direction = _compute_correlation(correlation_points)

    return VelocityResult(
        windows=windows,
        overall_commits_per_week=round(overall_cpw, 1),
        overall_lines_per_week=round(overall_lpw, 1),
        velocity_trend=velocity_trend,
        velocity_change_pct=round(velocity_change_pct, 1),
        correlation_points=correlation_points,
        correlation_direction=correlation_direction,
    )


def _build_windows(
    commits: list[Commit],
    start_date,
    end_date,
    window_days: int,
) -> list[VelocityWindow]:
    """Divide commits into time windows and compute per-window velocity."""
    window_delta = timedelta(days=window_days)
    windows: list[VelocityWindow] = []

    current_start = start_date
    while current_start < end_date:
        current_end = current_start + window_delta
        window_commits = [
            c for c in commits
            if current_start <= c.date < current_end
        ]

        if window_commits:
            weeks_in_window = window_days / 7
            lines = sum(
                fc.lines_added + fc.lines_removed
                for c in window_commits for fc in c.files
            )
            files = len({
                fc.path for c in window_commits for fc in c.files
            })
            authors = len({c.author for c in window_commits})

            windows.append(VelocityWindow(
                window_start=current_start,
                window_end=current_end,
                commits_count=len(window_commits),
                lines_changed=lines,
                files_touched=files,
                commits_per_week=round(len(window_commits) / weeks_in_window, 1),
                lines_per_week=round(lines / weeks_in_window, 1),
                unique_authors=authors,
            ))

        current_start = current_end

    return windows


def _compute_trend(windows: list[VelocityWindow]) -> tuple[str, float]:
    """Classify velocity trend by comparing first-half vs second-half average.

    Returns (trend_label, change_percentage).
    """
    if len(windows) < MIN_WINDOWS_FOR_TREND:
        return "stable", 0.0

    mid = len(windows) // 2
    first_half = windows[:mid]
    second_half = windows[mid:]

    avg_first = sum(w.commits_per_week for w in first_half) / len(first_half)
    avg_second = sum(w.commits_per_week for w in second_half) / len(second_half)

    if avg_first == 0:
        return "stable", 0.0

    change_pct = ((avg_second - avg_first) / avg_first) * 100

    if change_pct > TREND_THRESHOLD_PCT:
        return "accelerating", change_pct
    elif change_pct < -TREND_THRESHOLD_PCT:
        return "decelerating", change_pct
    else:
        return "stable", change_pct


def _compute_durability_points(
    commits: list[Commit],
    start_date,
    end_date,
    window_days: int,
    churn_days: int,
) -> list[VelocityDurabilityPoint]:
    """Compute per-window stabilization and churn for correlation.

    For each window, computes stabilization by checking if files modified
    in that window are re-modified within churn_days (looking at all
    subsequent commits, not just those in the window).
    """
    window_delta = timedelta(days=window_days)
    churn_delta = timedelta(days=churn_days)
    points: list[VelocityDurabilityPoint] = []

    # Index all file modifications: path → list of dates
    file_mod_dates: dict[str, list] = defaultdict(list)
    for c in commits:
        for fc in c.files:
            file_mod_dates[fc.path].append(c.date)

    # Sort modification dates for each file
    for path in file_mod_dates:
        file_mod_dates[path].sort()

    current_start = start_date
    while current_start < end_date:
        current_end = current_start + window_delta
        window_commits = [
            c for c in commits
            if current_start <= c.date < current_end
        ]

        if window_commits:
            weeks_in_window = window_days / 7
            cpw = len(window_commits) / weeks_in_window

            # Compute stabilization for this window
            files_in_window = {
                fc.path for c in window_commits for fc in c.files
            }
            files_touched = len(files_in_window)
            files_stabilized = 0

            for path in files_in_window:
                # Find the last modification of this file in this window
                mods_in_window = [
                    d for d in file_mod_dates[path]
                    if current_start <= d < current_end
                ]
                if not mods_in_window:
                    continue
                last_mod = max(mods_in_window)

                # Check if file is modified again within churn_days after last_mod
                rework_deadline = last_mod + churn_delta
                subsequent_mods = [
                    d for d in file_mod_dates[path]
                    if last_mod < d <= rework_deadline
                ]
                if not subsequent_mods:
                    files_stabilized += 1

            stab_ratio = files_stabilized / files_touched if files_touched > 0 else 1.0
            churn_count = files_touched - files_stabilized
            churn_rate = churn_count / files_touched if files_touched > 0 else 0.0

            points.append(VelocityDurabilityPoint(
                window_start=current_start,
                window_end=current_end,
                commits_per_week=round(cpw, 1),
                stabilization_ratio=round(stab_ratio, 3),
                churn_rate=round(churn_rate, 3),
            ))

        current_start = current_end

    return points


def _compute_correlation(
    points: list[VelocityDurabilityPoint],
) -> str:
    """Determine if velocity and stabilization move together or apart.

    Uses directional agreement: for each consecutive pair of points,
    check if velocity and stabilization move in the same direction.
    Returns "positive", "negative", or "neutral".
    """
    if len(points) < MIN_WINDOWS_FOR_TREND:
        return "neutral"

    agree = 0
    disagree = 0

    for i in range(1, len(points)):
        vel_delta = points[i].commits_per_week - points[i - 1].commits_per_week
        stab_delta = points[i].stabilization_ratio - points[i - 1].stabilization_ratio

        # Skip if either is flat (no signal)
        if abs(vel_delta) < 0.5 and abs(stab_delta) < 0.01:
            continue

        if abs(vel_delta) < 0.5 or abs(stab_delta) < 0.01:
            continue

        same_direction = (vel_delta > 0) == (stab_delta > 0)
        if same_direction:
            agree += 1
        else:
            disagree += 1

    total = agree + disagree
    if total == 0:
        return "neutral"

    ratio = agree / total
    if ratio >= 0.6:
        return "positive"
    elif ratio <= 0.4:
        return "negative"
    else:
        return "neutral"
