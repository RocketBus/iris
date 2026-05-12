"""Flow Load — WIP simultâneo de engenharia, por janela e por intent.

Counts how much work is in flight at the same time, rather than how much
work shipped. AI assistants tend to expand the amount of in-flight work
(more PRs opened in parallel) faster than they compress lifecycle time;
without this metric, throughput numbers (PRs/week) look healthy even when
the system is congested.

Three series are emitted per ISO week:

- ``wip_total``: distinct PRs whose lifecycle overlaps the week
- ``wip_by_intent``: same count, segmented by the PR's intent
  (FEATURE / FIX / REFACTOR / CONFIG / UNKNOWN). Intent is classified from
  the PR title using the same heuristics as the commit intent classifier.
- ``author_concurrency``: number of *distinct* commit authors with at
  least one commit landed in the week. This is a proxy for engineering
  parallelism that also captures work that hasn't yet reached PR stage.

A PR counts in bucket ``[t_start, t_end]`` when::

    created_at < t_end
    AND (merged_at is None  OR merged_at > t_start)
    AND (closed_at is None  OR closed_at > t_start)

Privacy / ranking risk
----------------------
The series are system-level aggregates, not per-person attributions. In
particular, ``author_concurrency`` exposes only the *count* of distinct
authors; the underlying author list MUST stay inside this module so the
schema cannot be used to derive "person X had high WIP in week Y". Review
the persisted schema before adding fields.

Coverage limitation
-------------------
Flow Load via PR + git measures WIP of *engineering*, not WIP of *product*.
Backlog, discovery, design, and work kept on private local branches do not
appear here. Surface that caveat anywhere this metric is presented.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from iris.analysis.intent_classifier import classify_commit
from iris.models.commit import Commit
from iris.models.pull_request import PullRequest


@dataclass(frozen=True)
class FlowLoadBucket:
    """Flow Load metrics for a single time bucket (ISO week)."""

    bucket: str                       # e.g. "2026-W18"
    bucket_start: date                # Monday of the ISO week
    bucket_end: date                  # Sunday of the ISO week
    wip_total: int                    # distinct PRs overlapping this bucket
    wip_by_intent: dict[str, int]     # ChangeIntent.value -> count
    author_concurrency: int           # distinct commit authors in bucket


@dataclass(frozen=True)
class FlowLoadResult:
    """Complete Flow Load analysis: one entry per bucket, ordered ascending."""

    buckets: list[FlowLoadBucket]
    bucket_granularity: str = "week"


# Minimum number of buckets required to surface a Flow Load series. With
# fewer than two, "WIP simultâneo" has no temporal contrast to interpret.
MIN_BUCKETS = 2


def analyze_flow_load(
    prs: list[PullRequest],
    commits: list[Commit],
    *,
    bucket: str = "week",
) -> FlowLoadResult | None:
    """Compute Flow Load series for a repository.

    Args:
        prs: PRs in all states (open / closed / merged) — typically from
            ``iris.ingestion.github_reader.read_pull_requests``.
        commits: Non-merge and merge commits — for author_concurrency.
        bucket: Bucket granularity. Only ``"week"`` is currently supported.

    Returns:
        A ``FlowLoadResult`` with one ``FlowLoadBucket`` per ISO week in
        the analysis window, or ``None`` if there is no signal to bucket
        or fewer than ``MIN_BUCKETS`` buckets emerge.
    """
    if bucket != "week":
        raise ValueError(f"unsupported bucket granularity: {bucket!r}")

    if not prs and not commits:
        return None

    bucket_starts = _enumerate_week_starts(prs, commits)
    if len(bucket_starts) < MIN_BUCKETS:
        return None

    pr_intents: dict[int, str] = {pr.number: _classify_pr_intent(pr) for pr in prs}

    # Per-bucket author sets stay strictly local — only the count is exposed.
    authors_per_bucket: dict[date, set[str]] = defaultdict(set)
    for commit in commits:
        if commit.is_merge:
            continue
        wk = _iso_week_start(commit.date)
        authors_per_bucket[wk].add(_author_key(commit))

    out: list[FlowLoadBucket] = []
    for week_start in bucket_starts:
        week_end_date = week_start + timedelta(days=6)
        bucket_end_dt = _to_utc_midnight(week_end_date + timedelta(days=1))
        bucket_start_dt = _to_utc_midnight(week_start)

        wip_total = 0
        wip_by_intent: dict[str, int] = defaultdict(int)
        for pr in prs:
            if not _pr_overlaps_bucket(pr, bucket_start_dt, bucket_end_dt):
                continue
            wip_total += 1
            wip_by_intent[pr_intents[pr.number]] += 1

        out.append(FlowLoadBucket(
            bucket=_iso_week_label(week_start),
            bucket_start=week_start,
            bucket_end=week_end_date,
            wip_total=wip_total,
            wip_by_intent=dict(wip_by_intent),
            author_concurrency=len(authors_per_bucket.get(week_start, set())),
        ))

    return FlowLoadResult(buckets=out, bucket_granularity="week")


def _pr_overlaps_bucket(
    pr: PullRequest,
    bucket_start: datetime,
    bucket_end: datetime,
) -> bool:
    """Return True when the PR was in flight during [bucket_start, bucket_end)."""
    if pr.created_at >= bucket_end:
        return False
    if pr.merged_at is not None and pr.merged_at <= bucket_start:
        return False
    if pr.state == "closed" and pr.closed_at is not None and pr.closed_at <= bucket_start:
        return False
    return True


def _classify_pr_intent(pr: PullRequest) -> str:
    """Classify a PR by its title, reusing the commit intent heuristics.

    A synthetic ``Commit`` (title-as-message, no files) is fed through the
    classifier so prefix and keyword rules apply; the file-type heuristic is
    inert here, which is acceptable — the result is exactly "what the PR
    title signals", not what its diff contains. The alternative of
    aggregating per-commit intent is left as future work.
    """
    synthetic = Commit(
        hash=f"pr-{pr.number}",
        author=pr.author,
        date=pr.created_at,
        message=pr.title,
    )
    return classify_commit(synthetic).intent.value


def _enumerate_week_starts(
    prs: list[PullRequest],
    commits: list[Commit],
) -> list[date]:
    """Build the list of ISO-week Mondays spanning every observed signal."""
    candidates: list[date] = []
    now = datetime.now(timezone.utc)

    for pr in prs:
        candidates.append(_iso_week_start(pr.created_at))
        end = pr.merged_at or pr.closed_at or now
        candidates.append(_iso_week_start(end))

    for commit in commits:
        candidates.append(_iso_week_start(commit.date))

    if not candidates:
        return []

    first = min(candidates)
    last = max(candidates)

    weeks: list[date] = []
    cursor = first
    while cursor <= last:
        weeks.append(cursor)
        cursor += timedelta(days=7)
    return weeks


def _author_key(commit: Commit) -> str:
    """De-dupe key for distinct-author counting. Prefers email when present."""
    email = (commit.author_email or "").strip().lower()
    if email:
        return email
    return commit.author.strip().lower()


def _iso_week_start(dt: datetime | date) -> date:
    """Monday of the ISO week containing ``dt``."""
    d = dt.date() if isinstance(dt, datetime) else dt
    return d - timedelta(days=d.weekday())


def _iso_week_label(week_start: date) -> str:
    """ISO week label ``YYYY-Www`` (Monday of the week)."""
    year, week, _ = week_start.isocalendar()
    return f"{year:04d}-W{week:02d}"


def _to_utc_midnight(d: date) -> datetime:
    """Convert a date to a tz-aware UTC midnight datetime for comparisons."""
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
