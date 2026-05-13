"""Flow Efficiency — decompose PR lifecycle into active vs wait time.

Throughput numbers (PRs/week) say nothing about whether shipped work is
genuinely flowing or just queued in different shapes. AI assistants
accelerate primarily the *active* fraction of the lifecycle (writing
code, drafting reviews), but rarely the *wait* fraction (PR sitting
without a first reviewer, approved PR waiting to be merged). Without
decomposing the lifecycle, an org sees throughput rise but lead time
remain flat and cannot explain why.

Phase model (5 timestamps → 4 phases per merged PR):

============================ ============================ =================
Phase                          Start → End                  Default class
============================ ============================ =================
Coding                         first_commit_at → pr_opened  Active
Awaiting first review          pr_opened → first_review     Wait
In review                      first_review → approval      Mixed (heuristic)
                               (or first_review → merged_at
                               when no formal approval)
Awaiting merge                 approval → merged_at         Wait
============================ ============================ =================

Active/wait heuristic for the "In review" phase
-----------------------------------------------
Each event inside the phase (commits + reviews) marks the next
``active_threshold_hours`` hours as *active*. Intervals are unioned;
time outside is *wait*. Threshold is parametrizable — the 4 h default
is a hypothesis pending calibration with 3-5 repos.

Privacy / ranking risk
----------------------
Flow Efficiency *per PR* is computed as an intermediate but MUST NEVER
appear in the persisted output or UI — it would let viewers attribute
inefficiency to an author or reviewer (Principle #2). Only aggregates
(median across the window, by intent, by origin, per-phase median) are
emitted. ``by_origin`` and ``by_intent`` segments are reported only when
the segment has ``>= min_sample`` PRs.

Scope
-----
- Merged PRs only. Open and closed-without-merge PRs lack a defined
  terminal state and are excluded.
- PRs with total elapsed < ``min_elapsed_seconds`` (default 5 min) are
  excluded — instant-merge bot PRs would distort the median.
- Bot reviewers (Copilot etc.) count as activity events just like
  humans. Origin classification is by commit author, not reviewer.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from statistics import median

from iris.analysis.intent_classifier import classify_commit
from iris.models.commit import Commit
from iris.models.pull_request import PullRequest


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PRPhases:
    """Per-PR phase timing in seconds. Intermediate only — never persisted."""

    coding: float
    awaiting_first_review: float
    in_review_active: float
    in_review_wait: float
    awaiting_merge: float
    had_first_review: bool

    @property
    def total_elapsed(self) -> float:
        return (
            self.coding
            + self.awaiting_first_review
            + self.in_review_active
            + self.in_review_wait
            + self.awaiting_merge
        )

    @property
    def active(self) -> float:
        return self.coding + self.in_review_active

    @property
    def wait(self) -> float:
        return self.awaiting_first_review + self.in_review_wait + self.awaiting_merge

    @property
    def efficiency(self) -> float:
        total = self.total_elapsed
        return self.active / total if total > 0 else 0.0


@dataclass(frozen=True)
class FlowEfficiencyResult:
    """Aggregates for the analysis window. No per-PR data leaves the module."""

    flow_efficiency_median: float
    median_time_to_first_review_hours: float | None
    time_in_phase_median_hours: dict[str, float]
    flow_efficiency_by_intent: dict[str, float] = field(default_factory=dict)
    flow_efficiency_by_origin: dict[str, float] = field(default_factory=dict)
    pr_count: int = 0


DEFAULT_ACTIVE_THRESHOLD_HOURS = 4.0
DEFAULT_MIN_SAMPLE = 10
DEFAULT_MIN_ELAPSED_SECONDS = 300.0  # 5 minutes


# ---------------------------------------------------------------------------
# Phase derivation
# ---------------------------------------------------------------------------


def compute_pr_phases(
    pr: PullRequest,
    *,
    active_threshold_hours: float = DEFAULT_ACTIVE_THRESHOLD_HOURS,
) -> PRPhases | None:
    """Compute the four-phase decomposition for a single merged PR.

    Returns ``None`` for PRs that aren't merged, lack a merged_at, or
    lack any commit timestamps (no anchor for first_commit_at).
    """
    if pr.state != "merged" or pr.merged_at is None:
        return None

    committed_times = [
        r.committed_at for r in pr.commit_refs if r.committed_at is not None
    ]
    if not committed_times:
        return None
    first_commit_at = min(committed_times)

    pr_opened_at = pr.created_at
    merged_at = pr.merged_at

    review_times = [r.submitted_at for r in pr.reviews]
    first_review_at = min(review_times) if review_times else None
    approval_times = [
        r.submitted_at for r in pr.reviews if r.state == "APPROVED"
    ]
    approval_at = min(approval_times) if approval_times else None

    coding = _seconds_between(first_commit_at, pr_opened_at)

    if first_review_at is None:
        # No reviews at all — the entire post-open window is "awaiting first
        # review" classified as wait, "In review" and "Awaiting merge" are 0.
        awaiting_first_review = _seconds_between(pr_opened_at, merged_at)
        return PRPhases(
            coding=coding,
            awaiting_first_review=awaiting_first_review,
            in_review_active=0.0,
            in_review_wait=0.0,
            awaiting_merge=0.0,
            had_first_review=False,
        )

    awaiting_first_review = _seconds_between(pr_opened_at, first_review_at)

    in_review_end = approval_at if approval_at is not None else merged_at
    in_review_start = first_review_at

    events: list[datetime] = list(committed_times) + list(review_times)
    in_review_active = _active_duration(
        events,
        phase_start=in_review_start,
        phase_end=in_review_end,
        threshold_hours=active_threshold_hours,
    )
    in_review_total = _seconds_between(in_review_start, in_review_end)
    in_review_wait = max(0.0, in_review_total - in_review_active)

    awaiting_merge = (
        _seconds_between(approval_at, merged_at) if approval_at is not None else 0.0
    )

    return PRPhases(
        coding=coding,
        awaiting_first_review=awaiting_first_review,
        in_review_active=in_review_active,
        in_review_wait=in_review_wait,
        awaiting_merge=awaiting_merge,
        had_first_review=True,
    )


# ---------------------------------------------------------------------------
# Window aggregation
# ---------------------------------------------------------------------------


def analyze_flow_efficiency(
    prs: list[PullRequest],
    *,
    commit_origin_map: dict[str, str] | None = None,
    active_threshold_hours: float = DEFAULT_ACTIVE_THRESHOLD_HOURS,
    min_sample: int = DEFAULT_MIN_SAMPLE,
    min_elapsed_seconds: float = DEFAULT_MIN_ELAPSED_SECONDS,
) -> FlowEfficiencyResult | None:
    """Compute Flow Efficiency aggregates for a window of merged PRs.

    Args:
        prs: PRs from github_reader (any state — non-merged are skipped).
        commit_origin_map: optional ``hash → CommitOrigin.value`` lookup.
            When provided, ``flow_efficiency_by_origin`` is populated using
            the rule "PR is AI_ASSISTED if ≥50% of its non-bot commits are
            AI_ASSISTED, otherwise HUMAN; PRs with no classified commits
            are skipped from the by_origin segment".
        active_threshold_hours: window per event during the "In review"
            phase that counts as active.
        min_sample: minimum PRs per segment (intent or origin) to report.
        min_elapsed_seconds: PRs with total elapsed below this floor are
            dropped from all aggregates (instant-merge bot PRs).

    Returns:
        ``FlowEfficiencyResult`` or ``None`` when no PR survived the
        scope/floor filters.
    """
    phases_per_pr: list[tuple[PullRequest, PRPhases]] = []
    for pr in prs:
        phases = compute_pr_phases(pr, active_threshold_hours=active_threshold_hours)
        if phases is None:
            continue
        if phases.total_elapsed < min_elapsed_seconds:
            continue
        phases_per_pr.append((pr, phases))

    if not phases_per_pr:
        return None

    efficiencies = [p.efficiency for _, p in phases_per_pr]
    flow_efficiency_median = round(median(efficiencies), 3)

    ttfr_seconds = [
        p.awaiting_first_review
        for _, p in phases_per_pr
        if p.had_first_review
    ]
    median_ttfr_hours = (
        round(median(ttfr_seconds) / 3600.0, 1) if ttfr_seconds else None
    )

    time_in_phase_median_hours = {
        "coding": _median_hours([p.coding for _, p in phases_per_pr]),
        "awaiting_first_review": _median_hours(
            [p.awaiting_first_review for _, p in phases_per_pr]
        ),
        "in_review_active": _median_hours(
            [p.in_review_active for _, p in phases_per_pr]
        ),
        "in_review_wait": _median_hours(
            [p.in_review_wait for _, p in phases_per_pr]
        ),
        "awaiting_merge": _median_hours(
            [p.awaiting_merge for _, p in phases_per_pr]
        ),
    }

    by_intent: dict[str, list[float]] = defaultdict(list)
    for pr, phases in phases_per_pr:
        intent = _pr_intent(pr)
        by_intent[intent].append(phases.efficiency)
    flow_efficiency_by_intent = {
        intent: round(median(vals), 3)
        for intent, vals in by_intent.items()
        if len(vals) >= min_sample
    }

    flow_efficiency_by_origin: dict[str, float] = {}
    if commit_origin_map is not None:
        by_origin: dict[str, list[float]] = defaultdict(list)
        for pr, phases in phases_per_pr:
            origin = _pr_origin(pr, commit_origin_map)
            if origin is None:
                continue
            by_origin[origin].append(phases.efficiency)
        flow_efficiency_by_origin = {
            origin: round(median(vals), 3)
            for origin, vals in by_origin.items()
            if len(vals) >= min_sample
        }

    return FlowEfficiencyResult(
        flow_efficiency_median=flow_efficiency_median,
        median_time_to_first_review_hours=median_ttfr_hours,
        time_in_phase_median_hours=time_in_phase_median_hours,
        flow_efficiency_by_intent=flow_efficiency_by_intent,
        flow_efficiency_by_origin=flow_efficiency_by_origin,
        pr_count=len(phases_per_pr),
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seconds_between(a: datetime, b: datetime) -> float:
    """Non-negative seconds between two datetimes."""
    return max(0.0, (b - a).total_seconds())


def _median_hours(values: list[float]) -> float:
    if not values:
        return 0.0
    return round(median(values) / 3600.0, 1)


def _active_duration(
    events: list[datetime],
    *,
    phase_start: datetime,
    phase_end: datetime,
    threshold_hours: float,
) -> float:
    """Total seconds inside [phase_start, phase_end] covered by any event-bursts.

    Each event ``t`` claims [max(t, phase_start), min(t + threshold, phase_end)]
    as active. Overlapping intervals are unioned before summing.
    """
    if phase_end <= phase_start:
        return 0.0

    threshold_seconds = threshold_hours * 3600.0
    intervals: list[tuple[float, float]] = []
    start_epoch = phase_start.timestamp()
    end_epoch = phase_end.timestamp()
    for event in events:
        t = event.timestamp()
        if t + threshold_seconds <= start_epoch:
            continue
        if t >= end_epoch:
            continue
        lo = max(t, start_epoch)
        hi = min(t + threshold_seconds, end_epoch)
        if hi > lo:
            intervals.append((lo, hi))

    if not intervals:
        return 0.0

    intervals.sort()
    merged_total = 0.0
    cur_lo, cur_hi = intervals[0]
    for lo, hi in intervals[1:]:
        if lo <= cur_hi:
            cur_hi = max(cur_hi, hi)
        else:
            merged_total += cur_hi - cur_lo
            cur_lo, cur_hi = lo, hi
    merged_total += cur_hi - cur_lo
    return merged_total


def _pr_intent(pr: PullRequest) -> str:
    """Classify the PR by its title, reusing the commit intent classifier."""
    synthetic = Commit(
        hash=f"pr-{pr.number}",
        author=pr.author,
        date=pr.created_at,
        message=pr.title,
    )
    return classify_commit(synthetic).intent.value


def _pr_origin(pr: PullRequest, origin_map: dict[str, str]) -> str | None:
    """Roll PR commit origins up to a single PR-level label.

    Rule: PR is AI_ASSISTED when at least 50% of its classifiable non-bot
    commits are AI_ASSISTED; otherwise HUMAN. Bot-authored commits are
    excluded from both numerator and denominator. PRs with no classified
    commits return ``None``.
    """
    non_bot = 0
    ai = 0
    for ref in pr.commit_refs:
        origin = origin_map.get(ref.hash)
        if origin is None or origin == "BOT":
            continue
        non_bot += 1
        if origin == "AI_ASSISTED":
            ai += 1
    if non_bot == 0:
        return None
    return "AI_ASSISTED" if (ai / non_bot) >= 0.5 else "HUMAN"
