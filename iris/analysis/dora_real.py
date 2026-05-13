"""DORA metrics computed from Datadog-derived external events.

The engine consumes pre-fetched events (see ``iris.models.external``);
Datadog talks to nobody here. Treats Datadog's tri-state
``change_failure`` correctly — ``None`` deployments are excluded from
the CFR denominator and surfaced as a "pending evaluation" bucket so
the dashboard can show *what we don't know yet* alongside what we do.

Metrics produced (see :class:`DORARealResult`):

- **CFR** — failed deploys / evaluated deploys (excludes pending).
- **MTTR per-deploy** — median/p50/p90 of ``recovery_time_sec`` over
  failed deploys. The per-deploy lens is what powers the AI-vs-human
  correlation in slice 5 because it joins cleanly through
  ``commit_sha``.
- **MTTR per-incident** — median/p50/p90 of ``time_to_restore_seconds``
  over failure events. The canonical DORA-reporting number.
- **Rollback rate** — free byproduct of ``remediation.type``; the
  fraction of failed deploys that ended in a rollback.
- **Lead time** — median of ``commits[].change_lead_time`` across every
  commit on every deploy.
- **Deploy frequency** — deploys per day when a window is provided.
"""

from dataclasses import dataclass, field
from statistics import median

from iris.models.external import (
    ExternalDeployment,
    ExternalDORAData,
    ExternalIncident,
)


@dataclass(frozen=True)
class DORAPercentile:
    p50: float
    p90: float


@dataclass(frozen=True)
class DORARealResult:
    """Datadog-derived DORA metrics for the analysis window."""

    source: str  # "datadog"
    deployments_total: int
    deployments_failed: int
    deployments_pending_evaluation: int
    incidents_total: int

    # CFR is None when no deployments have been evaluated (everything is pending).
    cfr: float | None = None

    # Seconds. None when no failed deploys carry recovery_time_sec.
    mttr_per_deploy_seconds_median: float | None = None
    mttr_per_deploy_seconds_p90: float | None = None

    # Seconds. None when no incidents carry time_to_restore_seconds.
    mttr_per_incident_seconds_median: float | None = None
    mttr_per_incident_seconds_p90: float | None = None

    # Rollback rate is None when no failed deploys exist.
    rollback_rate: float | None = None
    rollbacks_total: int = 0

    # Lead time over commits[].change_lead_time. None when no commits carry it.
    lead_time_seconds_median: float | None = None

    # Deploys per calendar day across the window. None when the caller didn't
    # supply window timestamps.
    deploy_frequency_per_day: float | None = None

    # Per-remediation breakdown (e.g. {"rollback": 12, "hotfix": 3}).
    remediation_distribution: dict[str, int] = field(default_factory=dict)

    # CFR by code origin — populated only when ``origin_map`` is provided to
    # :func:`analyze_dora_real`. Counts per-commit: each commit on each deploy
    # gets bucketed by its author's origin (looked up from the local commit
    # window's classifier output). Deploys with ``change_failure=None`` are
    # excluded from the denominator, mirroring the org-level CFR.
    #
    # Shape:  {origin: {"failed": int, "evaluated": int, "cfr": float | None}}
    cfr_by_origin: dict[str, dict] | None = None

    # Rollback rate by code origin — analogue of cfr_by_origin filtered on
    # ``remediation_type='rollback'``. None when ``origin_map`` wasn't
    # provided or when no failed deploys exist.
    rollback_rate_by_origin: dict[str, dict] | None = None

    # Org-wide attribution coverage for the by-origin breakdowns:
    # ``known_origin_commits / total_referenced_commits`` across all
    # evaluated deploys. Surfaces *how much* of the data was actually
    # attributable — a low number means many deploys referenced commits
    # older than the analysis window. None when ``origin_map`` wasn't
    # provided.
    cfr_by_origin_coverage_pct: float | None = None


def analyze_dora_real(
    data: ExternalDORAData,
    origin_map: dict[str, str] | None = None,
) -> DORARealResult:
    """Compute DORA metrics from the pre-fetched external events.

    Empty input is supported — every metric defaults to ``None`` / 0
    so the aggregator can wire the result unconditionally.

    Args:
        data: Pre-fetched DORA events (deployments + incidents).
        origin_map: Optional ``{commit_sha: origin_value}`` from
            :func:`iris.analysis.origin_classifier.classify_origins`.
            When provided, populates ``cfr_by_origin`` and
            ``rollback_rate_by_origin`` on the result.
    """
    deploys = list(data.deployments)
    incidents = list(data.incidents)

    failed = [d for d in deploys if d.change_failure is True]
    pending = [d for d in deploys if d.change_failure is None]
    evaluated = [d for d in deploys if d.change_failure is not None]

    cfr = (len(failed) / len(evaluated)) if evaluated else None

    deploy_recoveries = [
        d.recovery_time_sec for d in failed if d.recovery_time_sec is not None
    ]
    mttr_deploy = _percentiles(deploy_recoveries)

    incident_restores = [
        i.time_to_restore_seconds
        for i in incidents
        if i.time_to_restore_seconds is not None
    ]
    mttr_incident = _percentiles(incident_restores)

    rollbacks = [d for d in failed if d.remediation_type == "rollback"]
    rollback_rate = (len(rollbacks) / len(failed)) if failed else None

    remediation_distribution: dict[str, int] = {}
    for d in failed:
        key = d.remediation_type or "unknown"
        remediation_distribution[key] = remediation_distribution.get(key, 0) + 1

    lead_times = [
        c.change_lead_time
        for d in deploys
        for c in d.commits
        if c.change_lead_time is not None
    ]
    lead_time_median = median(lead_times) if lead_times else None

    deploy_freq = _deploy_frequency_per_day(
        len(deploys), data.window_from, data.window_to
    )

    if origin_map:
        cfr_by_origin, rollback_by_origin, coverage_pct = _by_origin(
            evaluated, failed, origin_map
        )
    else:
        cfr_by_origin, rollback_by_origin, coverage_pct = None, None, None

    return DORARealResult(
        source=data.source,
        deployments_total=len(deploys),
        deployments_failed=len(failed),
        deployments_pending_evaluation=len(pending),
        incidents_total=len(incidents),
        cfr=cfr,
        mttr_per_deploy_seconds_median=mttr_deploy.p50 if mttr_deploy else None,
        mttr_per_deploy_seconds_p90=mttr_deploy.p90 if mttr_deploy else None,
        mttr_per_incident_seconds_median=mttr_incident.p50
        if mttr_incident
        else None,
        mttr_per_incident_seconds_p90=mttr_incident.p90 if mttr_incident else None,
        rollback_rate=rollback_rate,
        rollbacks_total=len(rollbacks),
        lead_time_seconds_median=float(lead_time_median)
        if lead_time_median is not None
        else None,
        deploy_frequency_per_day=deploy_freq,
        remediation_distribution=remediation_distribution,
        cfr_by_origin=cfr_by_origin,
        rollback_rate_by_origin=rollback_by_origin,
        cfr_by_origin_coverage_pct=coverage_pct,
    )


def _by_origin(
    evaluated: list[ExternalDeployment],
    failed: list[ExternalDeployment],
    origin_map: dict[str, str],
) -> tuple[dict[str, dict], dict[str, dict] | None, float]:
    """Per-commit CFR + rollback breakdown by origin.

    Each commit on each evaluated deploy is counted once per origin.
    Commits whose sha doesn't appear in ``origin_map`` (e.g. older than
    the analysis window) are dropped from the per-origin buckets but
    contribute to the org-wide ``coverage_pct`` (third return value):
    ``known / (known + unknown)`` across every evaluated deploy.
    """
    evaluated_by_origin: dict[str, int] = {}
    failed_by_origin: dict[str, int] = {}
    rollback_by_origin: dict[str, int] = {}
    known_total = 0
    unknown_total = 0

    for d in evaluated:
        is_failed = d.change_failure is True
        is_rollback = is_failed and d.remediation_type == "rollback"
        for c in d.commits:
            origin = origin_map.get(c.commit_sha)
            if origin is None:
                unknown_total += 1
                continue
            known_total += 1
            evaluated_by_origin[origin] = evaluated_by_origin.get(origin, 0) + 1
            if is_failed:
                failed_by_origin[origin] = failed_by_origin.get(origin, 0) + 1
            if is_rollback:
                rollback_by_origin[origin] = rollback_by_origin.get(origin, 0) + 1

    cfr_result: dict[str, dict] = {}
    for origin, evaluated_count in evaluated_by_origin.items():
        failed_count = failed_by_origin.get(origin, 0)
        cfr_result[origin] = {
            "failed": failed_count,
            "evaluated": evaluated_count,
            "cfr": (failed_count / evaluated_count) if evaluated_count else None,
        }

    referenced_total = known_total + unknown_total
    coverage_pct = (
        round(known_total / referenced_total * 100, 1)
        if referenced_total
        else 100.0
    )

    if not failed:
        return cfr_result, None, coverage_pct

    rollback_result: dict[str, dict] = {}
    for origin, failed_count in failed_by_origin.items():
        rollback_count = rollback_by_origin.get(origin, 0)
        rollback_result[origin] = {
            "rollbacks": rollback_count,
            "failed": failed_count,
            "rollback_rate": (rollback_count / failed_count) if failed_count else None,
        }

    return cfr_result, rollback_result, coverage_pct


def _percentiles(values: list[int]) -> DORAPercentile | None:
    if not values:
        return None
    sorted_values = sorted(values)
    p50 = float(median(sorted_values))
    p90 = float(_percentile(sorted_values, 0.9))
    return DORAPercentile(p50=p50, p90=p90)


def _percentile(sorted_values: list[int], q: float) -> float:
    if not sorted_values:
        raise ValueError("empty input")
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    # Nearest-rank percentile (matches what pandas does with method="nearest").
    rank = max(1, int(round(q * len(sorted_values))))
    rank = min(rank, len(sorted_values))
    return float(sorted_values[rank - 1])


def _deploy_frequency_per_day(
    deploy_count: int,
    window_from,
    window_to,
) -> float | None:
    if window_from is None or window_to is None:
        return None
    span_seconds = (window_to - window_from).total_seconds()
    if span_seconds <= 0:
        return None
    days = span_seconds / 86400.0
    return round(deploy_count / days, 4)


__all__ = [
    "DORARealResult",
    "DORAPercentile",
    "analyze_dora_real",
]


# These names are re-exported for tests that don't want to peek at private helpers.
_TESTING_PERCENTILES = _percentiles
_TESTING_DEPLOY_FREQ = _deploy_frequency_per_day
