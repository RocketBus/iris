"""Open PR Aging — saúde do inventário de PRs ainda abertos.

Engine measures of "PRs that shipped" (Flow Efficiency, Lead Time,
single-pass) and "WIP per window" (Flow Load) tell us about work that
moved or work in flight. Neither says anything about the *stuck
inventory*: PRs that have been sitting open for weeks or months. In
teams with high AI adoption, this is becoming a distinct failure mode
— AI generates faster than reviewers absorb, and ownership can
evaporate when the original author moves on.

Snapshot vs window
------------------
Unlike most modules in this package, this one operates on the
**current snapshot** of open PRs, not the analysis window. ``now``
is passed in explicitly so tests can be deterministic and so the
caller (aggregator) can align it with the run timestamp.

Privacy / ranking risk
----------------------
Per-PR age/staleness is computed as an intermediate but MUST NEVER
appear in the persisted output or UI — it would let viewers attribute
"long PR" to specific authors (Principle #2). Only aggregates leave
the module. Segment quebras are by intent and origin (attributes of
the work), never by author. ``min_sample = 5`` keeps thinly-populated
segments — like AI_LED with N=1 — from implicitly identifying a
single person.

Filtering
---------
Drafts are dropped (intentionally long-running). Bot-authored PRs
are dropped via the same ``_BOT_AUTHOR_PATTERNS`` regex used by
``origin_classifier`` — Dependabot/Renovate sitting open is a
triage queue artifact, not "stuck work".

Staleness signal
----------------
``days_since_last_activity = now - max(created_at, last_review_at,
last_commit_at)``. GitHub's ``updatedAt`` is deliberately *not*
used — labels, assignees and other low-signal touches bump it and
would mask genuine inactivity. Only review submissions and commit
pushes count.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from statistics import median

from iris.analysis.flow_efficiency import _pr_intent, _pr_origin
from iris.analysis.origin_classifier import _BOT_AUTHOR_PATTERNS
from iris.models.pull_request import PullRequest


# ---------------------------------------------------------------------------
# Thresholds — top-level so they're easy to retune after calibration.
# ---------------------------------------------------------------------------

STALE_DAYS = 14
VERY_STALE_DAYS = 30
ABANDONMENT_DAYS = 60
DEFAULT_MIN_SAMPLE = 5


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _OpenPRAgeStats:
    """Per-PR stats. Intermediate only — never persisted."""

    age_days: int
    days_since_last_activity: int


@dataclass(frozen=True)
class OpenPRAgingResult:
    """Aggregates for the open-PR snapshot. No per-PR data leaves the module."""

    open_pr_count: int
    median_open_pr_age_days: float
    p90_open_pr_age_days: float
    stale_open_pr_pct: float
    very_stale_open_pr_pct: float
    abandonment_risk_pct: float
    median_open_pr_age_by_intent: dict[str, float] = field(default_factory=dict)
    stale_open_pr_pct_by_origin: dict[str, float] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Window aggregation
# ---------------------------------------------------------------------------


def analyze_open_pr_aging(
    prs: list[PullRequest],
    *,
    now: datetime,
    commit_origin_map: dict[str, str] | None = None,
    min_sample: int = DEFAULT_MIN_SAMPLE,
) -> OpenPRAgingResult | None:
    """Compute open-PR aging aggregates from a snapshot of PRs.

    Args:
        prs: PRs from github_reader (any state — non-open are skipped).
        now: timestamp used for age/staleness math. Caller-supplied so
            tests can be deterministic. Should be tz-aware UTC.
        commit_origin_map: optional ``hash → CommitOrigin.value`` lookup.
            When provided, ``stale_open_pr_pct_by_origin`` is populated
            using the same 50% rule as Flow Efficiency.
        min_sample: minimum PRs per segment to report. Segments below
            this threshold are omitted to avoid identifying individuals.

    Returns:
        ``OpenPRAgingResult`` or ``None`` when no eligible open PR
        survives the draft/bot filters.
    """
    eligible: list[tuple[PullRequest, _OpenPRAgeStats]] = []
    for pr in prs:
        if pr.state != "open":
            continue
        if pr.is_draft:
            continue
        if _is_bot_author(pr.author):
            continue
        stats = _compute_stats(pr, now=now)
        eligible.append((pr, stats))

    if not eligible:
        return None

    ages = [s.age_days for _, s in eligible]
    inactivities = [s.days_since_last_activity for _, s in eligible]
    count = len(eligible)

    median_age = round(median(ages), 1)
    p90_age = round(_percentile(ages, 0.9), 1)
    stale_pct = round(
        sum(1 for d in inactivities if d >= STALE_DAYS) / count, 3
    )
    very_stale_pct = round(
        sum(1 for d in inactivities if d >= VERY_STALE_DAYS) / count, 3
    )
    abandonment_pct = round(
        sum(1 for d in inactivities if d >= ABANDONMENT_DAYS) / count, 3
    )

    by_intent_ages: dict[str, list[int]] = defaultdict(list)
    for pr, stats in eligible:
        by_intent_ages[_pr_intent(pr)].append(stats.age_days)
    median_age_by_intent = {
        intent: round(median(vals), 1)
        for intent, vals in by_intent_ages.items()
        if len(vals) >= min_sample
    }

    stale_pct_by_origin: dict[str, float] = {}
    if commit_origin_map is not None:
        by_origin_inactivities: dict[str, list[int]] = defaultdict(list)
        for pr, stats in eligible:
            origin = _pr_origin(pr, commit_origin_map)
            if origin is None:
                continue
            by_origin_inactivities[origin].append(stats.days_since_last_activity)
        stale_pct_by_origin = {
            origin: round(
                sum(1 for d in vals if d >= STALE_DAYS) / len(vals), 3
            )
            for origin, vals in by_origin_inactivities.items()
            if len(vals) >= min_sample
        }

    return OpenPRAgingResult(
        open_pr_count=count,
        median_open_pr_age_days=median_age,
        p90_open_pr_age_days=p90_age,
        stale_open_pr_pct=stale_pct,
        very_stale_open_pr_pct=very_stale_pct,
        abandonment_risk_pct=abandonment_pct,
        median_open_pr_age_by_intent=median_age_by_intent,
        stale_open_pr_pct_by_origin=stale_pct_by_origin,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _compute_stats(pr: PullRequest, *, now: datetime) -> _OpenPRAgeStats:
    age_days = max(0, (now - pr.created_at).days)
    last_activity = _last_activity_at(pr)
    inactivity_days = max(0, (now - last_activity).days)
    return _OpenPRAgeStats(
        age_days=age_days,
        days_since_last_activity=inactivity_days,
    )


def _last_activity_at(pr: PullRequest) -> datetime:
    """Most recent significant activity timestamp.

    Significant = review submission or commit push. Created-at is the
    floor: a PR with zero reviews and zero commits-after-open has
    ``days_since_last_activity == age_days``.
    """
    candidates: list[datetime] = [pr.created_at]
    candidates.extend(r.submitted_at for r in pr.reviews)
    candidates.extend(
        c.committed_at for c in pr.commit_refs if c.committed_at is not None
    )
    return max(candidates)


def _is_bot_author(author: str) -> bool:
    """Same regex as origin_classifier — one source of truth for 'bot'."""
    return bool(_BOT_AUTHOR_PATTERNS.search(author or ""))


def _percentile(values: list[int], q: float) -> float:
    """Linear-interpolated percentile. ``q`` in [0, 1]."""
    if not values:
        return 0.0
    s = sorted(values)
    if len(s) == 1:
        return float(s[0])
    pos = q * (len(s) - 1)
    lo = int(pos)
    hi = min(lo + 1, len(s) - 1)
    frac = pos - lo
    return s[lo] + (s[hi] - s[lo]) * frac


# ---------------------------------------------------------------------------
# Public defaults
# ---------------------------------------------------------------------------


def now_utc() -> datetime:
    """Conventional ``now`` for callers that don't override."""
    return datetime.now(timezone.utc)
