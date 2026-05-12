"""Activity timeline — weekly breakdown of commits, LOC, intent, origin, and quality.

Generates a week-by-week timeline of repository activity and detects
temporal patterns that explain why metrics changed.

Patterns detected:
- burst_then_fix: high-volume week followed by fix-dominant week
- quiet_period: week with <25% of average commit volume
- ai_ramp: AI share jumps >15pp between consecutive weeks
- intent_shift: any intent changes >20pp between consecutive weeks

Design decisions:
- ISO weeks (Monday-Sunday) for consistent grouping
- Minimum 3 commits per week to compute ratios (avoids distortion)
- Stabilization per week uses commits from that week only
- Churn detection crosses week boundaries (uses full churn window)
- Minimum 4 weeks of data for pattern detection
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from statistics import median

from iris.analysis.churn_calculator import calculate_churn
from iris.analysis.intent_classifier import classify_commit
from iris.analysis.origin_classifier import CommitOrigin, classify_origin
from iris.metrics.stabilization import calculate_stabilization
from iris.models.commit import Commit
from iris.models.intent import ChangeIntent
from iris.models.pull_request import PullRequest


@dataclass(frozen=True)
class WeekActivity:
    """Metrics for a single ISO week."""

    week_start: date
    week_end: date
    commits: int
    lines_changed: int
    intent_distribution: dict[str, int]
    origin_distribution: dict[str, int]
    stabilization_ratio: float | None  # None when < MIN_COMMITS_FOR_RATIO
    churn_events: int
    prs_merged: int | None
    pr_median_ttm_hours: float | None


@dataclass(frozen=True)
class TimelinePattern:
    """A detected temporal pattern."""

    pattern: str
    week_label: str   # "MM/DD" of the relevant week
    description: str


@dataclass(frozen=True)
class TimelineResult:
    """Complete activity timeline with detected patterns."""

    weeks: list[WeekActivity]
    patterns: list[TimelinePattern]


# Minimum commits in a week to compute ratios (avoids distortion).
MIN_COMMITS_FOR_RATIO = 3

# Minimum commits in BOTH weeks to detect shift patterns (more conservative).
MIN_COMMITS_FOR_SHIFT = 5

# Minimum weeks of data for pattern detection.
MIN_WEEKS_FOR_PATTERNS = 4

# Pattern thresholds.
BURST_MULTIPLIER = 2.0          # >2x average = burst
QUIET_FRACTION = 0.25           # <25% of average = quiet
FIX_DOMINANT_THRESHOLD = 0.50   # >50% fix commits = fix-dominant
AI_RAMP_THRESHOLD_PP = 15       # >15pp AI share increase
INTENT_SHIFT_THRESHOLD_PP = 20  # >20pp change in any intent


def calculate_activity_timeline(
    commits: list[Commit],
    churn_days: int,
    prs: list[PullRequest] | None = None,
) -> TimelineResult | None:
    """Generate a weekly activity timeline from commits.

    Args:
        commits: All commits sorted by date ascending.
        churn_days: Churn/stabilization window in days.
        prs: Optional merged PRs for PR metrics per week.

    Returns:
        TimelineResult with weekly breakdown and detected patterns,
        or None if fewer than 2 weeks of data.
    """
    if not commits:
        return None

    # Group commits by ISO week
    week_commits: dict[date, list[Commit]] = defaultdict(list)
    for commit in commits:
        week_start = _iso_week_start(commit.date)
        week_commits[week_start].append(commit)

    if len(week_commits) < 2:
        return None

    # Group merged PRs by ISO week (by merged_at). Open/closed PRs are
    # ignored here — the timeline reports merge throughput per week.
    week_prs: dict[date, list[PullRequest]] = defaultdict(list)
    if prs:
        for pr in prs:
            if pr.state != "merged" or pr.merged_at is None:
                continue
            week_start = _iso_week_start(pr.merged_at)
            week_prs[week_start].append(pr)

    # Fill in all weeks (including empty ones) between first and last commit
    first_week = min(week_commits.keys())
    last_week = max(week_commits.keys())
    all_weeks: list[date] = []
    current = first_week
    while current <= last_week:
        all_weeks.append(current)
        current += timedelta(days=7)

    # Build weekly metrics
    weeks: list[WeekActivity] = []
    for week_start in all_weeks:
        wc = week_commits.get(week_start, [])
        week_end = week_start + timedelta(days=6)

        # Volume
        total_commits = len(wc)
        total_lines = sum(
            fc.lines_added + fc.lines_removed
            for c in wc for fc in c.files
        )

        # Intent distribution
        intent_dist: dict[str, int] = defaultdict(int)
        for c in wc:
            classified = classify_commit(c)
            intent_dist[classified.intent.value] += 1

        # Origin distribution
        origin_dist: dict[str, int] = defaultdict(int)
        for c in wc:
            origin = classify_origin(c)
            origin_dist[origin.value] += 1

        # Stabilization and churn (only meaningful with enough commits)
        stab_ratio = None
        churn_events = 0
        if total_commits >= MIN_COMMITS_FOR_RATIO:
            stab = calculate_stabilization(wc, churn_days)
            stab_ratio = round(stab.stabilization_ratio, 3)
            churn = calculate_churn(wc, churn_days)
            churn_events = churn.churn_events

        # PR metrics for this week
        wp = week_prs.get(week_start, [])
        prs_merged = len(wp) if prs is not None else None
        pr_ttm = None
        if wp:
            ttms = [(p.merged_at - p.created_at).total_seconds() / 3600 for p in wp]
            pr_ttm = round(median(ttms), 1)

        weeks.append(WeekActivity(
            week_start=week_start,
            week_end=week_end,
            commits=total_commits,
            lines_changed=total_lines,
            intent_distribution=dict(intent_dist),
            origin_distribution=dict(origin_dist),
            stabilization_ratio=stab_ratio,
            churn_events=churn_events,
            prs_merged=prs_merged,
            pr_median_ttm_hours=pr_ttm,
        ))

    # Detect patterns
    patterns = _detect_patterns(weeks) if len(weeks) >= MIN_WEEKS_FOR_PATTERNS else []

    return TimelineResult(weeks=weeks, patterns=patterns)


def _detect_patterns(weeks: list[WeekActivity]) -> list[TimelinePattern]:
    """Detect temporal patterns across weekly data."""
    patterns: list[TimelinePattern] = []

    avg_commits = sum(w.commits for w in weeks) / len(weeks)

    for i, week in enumerate(weeks):
        label = week.week_start.strftime("%m/%d")

        # Burst-then-fix: high volume followed by fix-dominant week
        if (
            week.commits > avg_commits * BURST_MULTIPLIER
            and i + 1 < len(weeks)
        ):
            next_week = weeks[i + 1]
            next_total = sum(next_week.intent_distribution.values())
            next_fix = next_week.intent_distribution.get("FIX", 0)
            if next_total > 0 and next_fix / next_total > FIX_DOMINANT_THRESHOLD:
                fix_pct = next_fix / next_total
                patterns.append(TimelinePattern(
                    pattern="burst_then_fix",
                    week_label=label,
                    description=f"Volume spiked {week.commits / avg_commits:.1f}x ({week.commits} commits), followed by {fix_pct:.0%} fix commits the next week.",
                ))

        # Quiet period
        if avg_commits > 0 and week.commits < avg_commits * QUIET_FRACTION and week.commits > 0:
            patterns.append(TimelinePattern(
                pattern="quiet_period",
                week_label=label,
                description=f"Only {week.commits} commits (avg {avg_commits:.0f}/week).",
            ))

        # AI ramp: compare with previous week (skip when either week is too small)
        if i > 0 and week.commits >= MIN_COMMITS_FOR_SHIFT and weeks[i - 1].commits >= MIN_COMMITS_FOR_SHIFT:
            prev = weeks[i - 1]
            ai_pct = _ai_pct(week)
            prev_ai_pct = _ai_pct(prev)
            delta = ai_pct - prev_ai_pct
            if delta >= AI_RAMP_THRESHOLD_PP:
                patterns.append(TimelinePattern(
                    pattern="ai_ramp",
                    week_label=label,
                    description=f"AI share jumped from {prev_ai_pct:.0f}% to {ai_pct:.0f}% (+{delta:.0f}pp).",
                ))

        # Intent shift: report the single largest shift per week
        if i > 0 and week.commits >= MIN_COMMITS_FOR_SHIFT and weeks[i - 1].commits >= MIN_COMMITS_FOR_SHIFT:
            prev = weeks[i - 1]
            biggest_intent = None
            biggest_delta = 0
            for intent in ["FEATURE", "FIX", "CONFIG", "REFACTOR"]:
                curr_pct = _intent_pct(week, intent)
                prev_pct = _intent_pct(prev, intent)
                delta = curr_pct - prev_pct
                if abs(delta) > abs(biggest_delta):
                    biggest_delta = delta
                    biggest_intent = intent
                    biggest_prev = prev_pct
                    biggest_curr = curr_pct
            if biggest_intent and abs(biggest_delta) >= INTENT_SHIFT_THRESHOLD_PP:
                direction = "up" if biggest_delta > 0 else "down"
                patterns.append(TimelinePattern(
                    pattern="intent_shift",
                    week_label=label,
                    description=f"{biggest_intent.capitalize()} share shifted {direction} {abs(biggest_delta):.0f}pp ({biggest_prev:.0f}% -> {biggest_curr:.0f}%).",
                ))

    return patterns


def render_delivery_pulse(weeks: list[WeekActivity]) -> list[str]:
    """Render a compact heatmap of weekly activity and health.

    Each week is represented by 1-5 colored squares:
    - Count = commit volume (scaled to max week)
    - Color = stabilization health:
      🟩 >= 70% (healthy)
      🟨 50-70% (moderate)
      🟥 < 50% (concerning)
      ⬜ insufficient data

    Returns lines of Markdown to include in the report.
    """
    if not weeks:
        return []

    max_commits = max(w.commits for w in weeks)
    if max_commits == 0:
        return []

    lines = []
    pulse_row = []
    label_row = []

    for week in weeks:
        # Scale to 1-4 squares
        if week.commits == 0:
            count = 0
        else:
            count = max(1, round(week.commits / max_commits * 4))

        # Pick color by stabilization
        stab = week.stabilization_ratio
        if stab is None:
            square = "⬜"
        elif stab >= 0.70:
            square = "🟩"
        elif stab >= 0.50:
            square = "🟨"
        else:
            square = "🟥"

        block = square * count if count > 0 else "⬜"
        # Pad to 4 squares wide for alignment
        padding = "  " * max(0, 4 - count)
        pulse_row.append(block + padding)

        label = week.week_start.strftime("%m/%d")
        label_row.append(label + " " * max(0, count * 2 - len(label) + (4 - count) * 2))

    lines.append(" ".join(pulse_row))
    lines.append(" ".join(label_row))
    lines.append("")
    lines.append("🟩 Stable (≥70%)  🟨 Moderate (50-70%)  🟥 Volatile (<50%)  ⬜ Insufficient data")

    return lines


def _ai_pct(week: WeekActivity) -> float:
    """AI percentage of non-bot commits."""
    total = sum(
        v for k, v in week.origin_distribution.items()
        if k != CommitOrigin.BOT.value
    )
    ai = week.origin_distribution.get(CommitOrigin.AI_ASSISTED.value, 0)
    return (ai / total * 100) if total > 0 else 0.0


def _intent_pct(week: WeekActivity, intent: str) -> float:
    """Percentage of commits with a given intent."""
    total = sum(week.intent_distribution.values())
    count = week.intent_distribution.get(intent, 0)
    return (count / total * 100) if total > 0 else 0.0


def _iso_week_start(dt: datetime) -> date:
    """Get the Monday of the ISO week containing dt."""
    d = dt.date() if isinstance(dt, datetime) else dt
    return d - timedelta(days=d.weekday())
