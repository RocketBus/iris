"""Origin funnel — track code from commit through review to survival, by origin.

Composes existing metrics (origin distribution, acceptance rate, stabilization,
durability) into a per-origin delivery funnel:

  Committed → In PR → Stabilized → Lines Surviving

Each stage has a conversion rate. Comparing funnels across origins reveals
where AI-assisted code drops off relative to human code.

Limitation: PR→Merge stage is not measured (Iris only fetches merged PRs).
Future work could add closed/rejected PR data to fill this gap.
"""

# AGGREGATOR_OPT_OUT: consumes a finalized ReportMetrics (post-aggregation composition).
# Invoked by the writer because it needs durability + acceptance_rate both present.
# Consumers: iris/reports/writer.py

from dataclasses import dataclass

from iris.models.metrics import ReportMetrics


@dataclass(frozen=True)
class FunnelStage:
    """A single stage in the origin funnel."""

    stage: str
    count: int | float
    conversion_from_previous: float | None  # None for the first stage


@dataclass(frozen=True)
class OriginFunnel:
    """Complete funnel for a single origin."""

    origin: str
    stages: list[FunnelStage]
    overall_conversion: float  # first stage → last stage


@dataclass(frozen=True)
class FunnelResult:
    """Funnel analysis across origins."""

    funnels: list[OriginFunnel]


def calculate_origin_funnel(metrics: ReportMetrics) -> FunnelResult | None:
    """Build per-origin delivery funnels from existing metrics.

    Requires at minimum origin distribution data. PR and durability
    data add stages when available.

    Args:
        metrics: ReportMetrics with origin, acceptance, and durability data.

    Returns:
        FunnelResult with per-origin funnels, or None if no origin data.
    """
    origin_dist = metrics.commit_origin_distribution
    if not origin_dist:
        return None

    funnels: list[OriginFunnel] = []

    for origin in ["HUMAN", "AI_ASSISTED"]:
        total_commits = origin_dist.get(origin, 0)
        if total_commits == 0:
            continue

        stages: list[FunnelStage] = []

        # Stage 1: Committed
        stages.append(FunnelStage(
            stage="Committed",
            count=total_commits,
            conversion_from_previous=None,
        ))

        # Stage 2: In PR (from acceptance rate)
        in_pr = total_commits  # default: assume all in PRs if no data
        if metrics.acceptance_by_origin:
            entry = metrics.acceptance_by_origin.get(origin)
            if entry:
                in_pr = entry.get("commits_in_prs", total_commits)

        pr_rate = in_pr / total_commits if total_commits > 0 else 1.0
        stages.append(FunnelStage(
            stage="In PR",
            count=in_pr,
            conversion_from_previous=round(pr_rate, 3),
        ))

        # Stage 3: Stabilized (from stabilization by origin)
        if metrics.stabilization_by_origin:
            stab = metrics.stabilization_by_origin.get(origin, {})
            files_stabilized = stab.get("files_stabilized", 0)
            files_touched = stab.get("files_touched", 0)
            stab_ratio = stab.get("stabilization_ratio", 0)
            stages.append(FunnelStage(
                stage="Stabilized",
                count=files_stabilized,
                conversion_from_previous=round(stab_ratio, 3),
            ))

        # Stage 4: Lines surviving (from durability)
        if metrics.durability_by_origin:
            dur = metrics.durability_by_origin.get(origin, {})
            surviving = dur.get("lines_surviving", 0)
            survival_rate = dur.get("survival_rate", 0)
            if surviving > 0:
                stages.append(FunnelStage(
                    stage="Lines Surviving",
                    count=surviving,
                    conversion_from_previous=round(survival_rate, 3),
                ))

        # Overall conversion: product of all stage conversions
        conversions = [
            s.conversion_from_previous for s in stages
            if s.conversion_from_previous is not None
        ]
        overall = 1.0
        for c in conversions:
            overall *= c

        funnels.append(OriginFunnel(
            origin=origin,
            stages=stages,
            overall_conversion=round(overall, 3),
        ))

    if not funnels:
        return None

    return FunnelResult(funnels=funnels)
