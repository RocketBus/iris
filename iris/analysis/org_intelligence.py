"""Cross-repo intelligence — synthesize patterns across an organization.

Generates change attribution, attention signals, and delivery narrative
from a collection of per-repo analysis results.

All language is observational: "associated with", "coinciding with".
Metrics are hypotheses, not conclusions.
"""

# AGGREGATOR_OPT_OUT: operates on a collection of per-repo ReportMetrics (org scope).
# Aggregator is per-repo; this module runs one level up in the org pipeline.
# Consumers: iris/org_runner.py

from statistics import median

from iris.analysis.trend_delta import (
    generate_attention_summary,
    detect_co_occurrences,
    _get_delta,
)
from iris.i18n import get_strings
from iris.models.org import AttentionSignal, RepoResult


# Dimensions used for change attribution grouping.
_DIMENSIONS = {
    "stability": {
        "metrics": ["stabilization_ratio", "churn_rate"],
        "label_key": "org_attribution_stability_dimension",
    },
    "feature": {
        "metrics": ["feature_stabilization", "feature_share"],
        "label_key": "org_attribution_feature_dimension",
    },
    "workflow": {
        "metrics": ["pr_time_to_merge", "pr_single_pass"],
        "label_key": "org_attribution_workflow_dimension",
    },
    "composition": {
        "metrics": ["fix_share", "config_share"],
        "label_key": "org_attribution_composition_dimension",
    },
}

# Stabilization delta threshold for trajectory classification (pp).
IMPROVING_THRESHOLD = 5.0
DECLINING_THRESHOLD = -5.0


def generate_change_attribution(
    results: list[RepoResult], lang: str = "en",
) -> str:
    """Generate a narrative paragraph describing the dominant cross-repo change pattern.

    Collects notable/significant deltas from repos with trend data, groups by
    dimension, scores by impact (significant=2, notable=1) weighted toward
    concerning directions, and describes the highest-impact dimension.
    """
    s = get_strings(lang)

    # Only repos with sufficient trend data
    trended = [r for r in results if r.trend and r.trend.has_sufficient_data]
    if not trended:
        return s["org_attribution_none"]

    # Score dimensions by weighted impact, not just repo count
    dimension_repos: dict[str, set[str]] = {d: set() for d in _DIMENSIONS}
    dimension_score: dict[str, float] = {d: 0.0 for d in _DIMENSIONS}
    dimension_deltas: dict[str, list[tuple[float, str]]] = {d: [] for d in _DIMENSIONS}

    for r in trended:
        for dim_name, dim_info in _DIMENSIONS.items():
            for metric_name in dim_info["metrics"]:
                delta = _get_delta(r.trend, metric_name)
                if delta and delta.classification != "stable":
                    dimension_repos[dim_name].add(r.repo_name)
                    # Weight: significant=2, notable=1; concerning direction gets 1.5x
                    weight = 2.0 if delta.classification == "significant" else 1.0
                    if _is_concerning_delta(delta):
                        weight *= 1.5
                    dimension_score[dim_name] += weight
                    is_concerning = _is_concerning_delta(delta)
                    detail_str = (
                        f"{r.repo_name} {delta.label} {delta.delta:+.0f}"
                        f"{'h' if delta.unit == 'h' else 'pp'}"
                    )
                    # Concerning details sort first (1), then positive (0)
                    concern_rank = 1 if is_concerning else 0
                    dimension_deltas[dim_name].append(
                        (concern_rank, abs(delta.delta), detail_str)
                    )

    # Find the dominant dimension by weighted score
    dominant = max(dimension_score, key=lambda d: dimension_score[d])
    affected_count = len(dimension_repos[dominant])

    if affected_count == 0:
        return s["org_attribution_none"]

    dimension_label = s[_DIMENSIONS[dominant]["label_key"]]

    intro = s["org_attribution_intro"].format(
        repo_count=len(trended),
        dimension=dimension_label,
        affected_count=affected_count,
    )

    # Pick top 3 most impactful details (concerning first, then by absolute delta)
    sorted_details = sorted(
        dimension_deltas[dominant],
        key=lambda x: (x[0], x[1]),
        reverse=True,
    )
    details = [d[2] for d in sorted_details[:3]]
    if details:
        detail_text = s["org_attribution_detail"].format(
            detail="; ".join(details),
        )
        return f"{intro} {detail_text}"

    return intro


# Patterns that indicate concerning trends (worth investigating).
_CONCERNING_PATTERNS = {
    "destabilizing", "stability_cascade", "fix_instability",
    "workflow_slowdown", "workflow_friction", "composition_shift", "mixed",
}

# Patterns that indicate positive trends (exclude from "Where to Look First").
_POSITIVE_PATTERNS = {"stabilizing", "recovery", "stable"}


def _infer_pattern(summary: str, s: dict[str, str]) -> str:
    """Infer the attention pattern from the summary text."""
    for key in ["destabilizing", "stabilizing", "workflow_friction",
                "composition_shift", "stable"]:
        full_key = f"attention_{key}"
        if full_key in s and summary.startswith(
            s[full_key].split("{")[0].strip()
        ):
            return key
    return "mixed"


def _co_occurrence_summary(co: object, trend, s: dict[str, str]) -> str:
    """Generate a summary sentence from a co-occurrence pattern using its i18n template."""
    key = co.summary_key
    if key not in s:
        return ""
    template = s[key]
    # Build format kwargs from the co-occurrence's metric deltas
    kwargs: dict[str, str] = {}
    for metric_name in co.metrics:
        d = _get_delta(trend, metric_name)
        if d is None:
            continue
        if metric_name == "stabilization_ratio":
            kwargs["stab_delta"] = f"{d.delta:+.0f}"
        elif metric_name == "churn_rate":
            kwargs["churn_delta"] = f"{abs(d.delta):.0f}"
        elif metric_name == "feature_stabilization":
            kwargs["feat_stab_delta"] = f"{d.delta:+.0f}"
        elif metric_name == "fix_stabilization":
            kwargs["fix_stab_delta"] = f"{d.delta:+.0f}"
        elif metric_name == "pr_time_to_merge":
            kwargs["ttm_delta"] = f"{abs(d.delta):.1f}"
        elif metric_name == "pr_single_pass":
            kwargs["spr_delta"] = f"{abs(d.delta):.0f}"
    try:
        return template.format(**kwargs)
    except KeyError:
        return ""


def detect_org_attention_signals(
    results: list[RepoResult], lang: str = "en",
) -> list[AttentionSignal]:
    """Detect top attention signals across the organization.

    Only surfaces repos with concerning patterns (destabilizing, workflow friction,
    composition shift, mixed). Repos that are stabilizing or recovering are excluded
    — "Where to Look First" means where to investigate problems, not improvements.
    """
    s = get_strings(lang)
    candidates: list[tuple[int, AttentionSignal]] = []

    for r in results:
        if not r.trend or not r.trend.has_sufficient_data:
            continue

        summary = generate_attention_summary(r.trend, lang=lang)
        co_occurrences = detect_co_occurrences(r.trend)

        # Find the first concerning co-occurrence pattern (skip positive ones)
        pattern = "mixed"
        concerning_co = None
        for co in co_occurrences:
            if co.pattern not in _POSITIVE_PATTERNS:
                pattern = co.pattern
                concerning_co = co
                break
        if pattern == "mixed" and summary:
            pattern = _infer_pattern(summary, s)

        # Skip repos with positive or stable patterns
        if pattern in _POSITIVE_PATTERNS:
            continue

        # Count severity: significant deltas count 2, notable count 1
        # Only count concerning deltas (negative stabilization, positive churn, etc.)
        severity = 0
        detail_items: list[str] = []
        for d in r.trend.deltas:
            if d.classification == "stable":
                continue
            is_concerning = _is_concerning_delta(d)
            weight = 2 if d.classification == "significant" else 1
            if is_concerning:
                severity += weight
            detail_items.append(
                f"{d.label} {d.delta:+.0f}"
                f"{'h' if d.unit == 'h' else 'pp'} ({d.classification})"
            )

        if severity == 0:
            continue

        # When the summary describes a positive trend but the repo is here
        # due to a concerning co-occurrence, override with the co-occurrence summary
        effective_summary = summary
        summary_pattern = _infer_pattern(summary, s) if summary else "mixed"
        if summary_pattern in _POSITIVE_PATTERNS and concerning_co:
            co_summary = _co_occurrence_summary(concerning_co, r.trend, s)
            if co_summary:
                effective_summary = co_summary

        # Fallback: if summary is still empty, build one from concerning deltas
        if not effective_summary:
            concerning_details = [
                d for d in r.trend.deltas
                if d.classification != "stable" and _is_concerning_delta(d)
            ]
            if concerning_details:
                top = sorted(concerning_details, key=lambda d: abs(d.delta), reverse=True)[:2]
                parts = [f"{d.label} {d.delta:+.0f}{'h' if d.unit == 'h' else 'pp'}" for d in top]
                effective_summary = s["attention_destabilizing"].format(
                    description=", ".join(parts),
                )

        candidates.append((severity, AttentionSignal(
            repository=r.repo_name,
            pattern=pattern,
            details=detail_items[:5],
            summary=effective_summary,
        )))

    # Sort by severity descending, take top 5
    candidates.sort(key=lambda x: x[0], reverse=True)
    return [signal for _, signal in candidates[:5]]


def _is_concerning_delta(d) -> bool:
    """Return True if this delta represents a concerning direction.

    Concerning means: stabilization down, churn up, revert up,
    PR merge time up, single-pass rate down. For composition metrics,
    any non-stable shift counts.
    """
    metric = d.metric
    if metric in ("stabilization_ratio", "feature_stabilization", "fix_stabilization"):
        return d.delta < 0
    if metric in ("churn_rate", "revert_rate"):
        return d.delta > 0
    if metric == "pr_time_to_merge":
        return d.delta > 0
    if metric == "pr_single_pass":
        return d.delta < 0
    # Composition shifts (fix_share, config_share, feature_share) — any shift counts
    return True


def generate_delivery_narrative(
    results: list[RepoResult], lang: str = "en",
) -> str:
    """Generate a narrative paragraph describing the overall delivery trajectory.

    Classifies repos by trajectory (improving, declining, stable, insufficient)
    and generates prose describing the distribution.
    """
    s = get_strings(lang)

    trended = [r for r in results if r.trend and r.trend.has_sufficient_data]
    insufficient = len(results) - len(trended)

    if not trended:
        return s["org_narrative_no_trend"]

    improving = 0
    declining = 0
    stable = 0

    for r in trended:
        stab_delta = _get_delta(r.trend, "stabilization_ratio")
        if stab_delta is None:
            stable += 1
            continue

        if stab_delta.delta >= IMPROVING_THRESHOLD:
            improving += 1
        elif stab_delta.delta <= DECLINING_THRESHOLD:
            declining += 1
        else:
            stable += 1

    total = len(trended)
    intro = s["org_narrative_intro"].format(
        total=total,
        improving=improving,
        declining=declining,
        stable=stable,
    )

    # Add insufficient count if any
    parts = [intro]
    if insufficient > 0:
        parts.append(s["org_narrative_insufficient"].format(
            insufficient=insufficient,
        ))

    # Determine dominant trajectory.
    # Compare improving vs declining directly — stable repos are the baseline,
    # not a competing category. The question is: of repos that ARE changing,
    # which direction dominates?
    if improving == 0 and declining == 0:
        parts.append(s["org_narrative_stable"])
    elif improving > 0 and declining == 0:
        parts.append(s["org_narrative_improving_dominant"])
    elif declining > 0 and improving == 0:
        parts.append(s["org_narrative_declining_dominant"])
    elif improving >= declining * 1.5:
        parts.append(s["org_narrative_improving_dominant"])
    elif declining >= improving * 1.5:
        parts.append(s["org_narrative_declining_dominant"])
    else:
        parts.append(s["org_narrative_mixed"])

    return " ".join(parts)
