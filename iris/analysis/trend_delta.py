"""Trend delta computation — compare baseline vs recent analysis windows.

Computes per-metric deltas between two ReportMetrics instances and classifies
each change as stable, notable, or significant.

Threshold constants are hypotheses — they exist to make the trend section
useful and should be refined through experimentation.
"""

# AGGREGATOR_OPT_OUT: consumes two finalized ReportMetrics (baseline vs recent).
# Runs post-aggregation by definition — cannot live inside a single aggregate() pass.
# Consumers: iris/cli.py (Step 5, Step 5b adoption comparison), iris/analysis/org_intelligence.py

from iris.i18n import get_strings
from iris.models.metrics import ReportMetrics
from iris.models.trend import CoOccurrence, MetricDelta, TrendResult

# --- Threshold hypotheses (v0.3) ---
# Percentage-point thresholds for ratio/share metrics.
PP_STABLE = 5.0       # delta < 5 pp → stable
PP_NOTABLE = 15.0     # 5 pp ≤ delta < 15 pp → notable
# ≥ 15 pp → significant

# Hour thresholds for time-to-merge.
HOURS_STABLE = 4.0    # delta < 4 h → stable
HOURS_NOTABLE = 12.0  # 4 h ≤ delta < 12 h → notable
# ≥ 12 h → significant

# Minimum commits required in the recent window to produce trend analysis.
MIN_COMMITS = 5


def _classify_pp(abs_delta: float) -> str:
    """Classify an absolute delta in percentage points."""
    if abs_delta < PP_STABLE:
        return "stable"
    if abs_delta < PP_NOTABLE:
        return "notable"
    return "significant"


def _classify_hours(abs_delta: float) -> str:
    """Classify an absolute delta in hours."""
    if abs_delta < HOURS_STABLE:
        return "stable"
    if abs_delta < HOURS_NOTABLE:
        return "notable"
    return "significant"


def _intent_share(metrics: ReportMetrics, intent: str) -> float:
    """Return percentage share (0-100) for an intent, or 0 if unavailable."""
    dist = metrics.commit_intent_distribution
    if not dist:
        return 0.0
    total = sum(dist.values())
    if total == 0:
        return 0.0
    return (dist.get(intent, 0) / total) * 100


def _intent_stabilization(metrics: ReportMetrics, intent: str) -> float | None:
    """Return stabilization ratio (0-100) for an intent, or None if unavailable."""
    stab = metrics.stabilization_by_intent
    if not stab or intent not in stab:
        return None
    entry = stab[intent]
    if entry.get("files_touched", 0) == 0:
        return None
    return entry["stabilization_ratio"] * 100


def _make_delta(
    metric: str,
    label: str,
    baseline_val: float,
    recent_val: float,
    unit: str,
) -> MetricDelta:
    """Build a MetricDelta with automatic classification."""
    delta = recent_val - baseline_val
    abs_delta = abs(delta)

    if unit == "h":
        classification = _classify_hours(abs_delta)
    else:
        classification = _classify_pp(abs_delta)

    return MetricDelta(
        metric=metric,
        label=label,
        baseline_value=round(baseline_val, 1),
        recent_value=round(recent_val, 1),
        delta=round(delta, 1),
        classification=classification,
        unit=unit,
    )


def compute_trend_delta(
    baseline: ReportMetrics,
    recent: ReportMetrics,
    baseline_days: int,
    recent_days: int,
    lang: str = "en",
) -> TrendResult:
    """Compare baseline and recent metrics, returning classified deltas.

    Args:
        baseline: Metrics computed over the full analysis window.
        recent: Metrics computed over the recent sub-window.
        baseline_days: Total analysis window in days.
        recent_days: Recent sub-window in days.
        lang: Language code for metric labels.

    Returns:
        TrendResult with per-metric deltas. If recent has fewer than
        MIN_COMMITS commits, has_sufficient_data is False and deltas
        is empty.
    """
    s = get_strings(lang)

    if recent.commits_total < MIN_COMMITS:
        return TrendResult(
            baseline_days=baseline_days,
            recent_days=recent_days,
            baseline_commits=baseline.commits_total,
            recent_commits=recent.commits_total,
            deltas=[],
            has_sufficient_data=False,
        )

    deltas: list[MetricDelta] = []

    # Core metrics (always available)
    deltas.append(_make_delta(
        "stabilization_ratio",
        s["trend_label_stabilization"],
        baseline.stabilization_ratio * 100,
        recent.stabilization_ratio * 100,
        "pp",
    ))

    baseline_churn_rate = (
        (baseline.churn_events / baseline.files_touched * 100)
        if baseline.files_touched > 0 else 0.0
    )
    recent_churn_rate = (
        (recent.churn_events / recent.files_touched * 100)
        if recent.files_touched > 0 else 0.0
    )
    deltas.append(_make_delta(
        "churn_rate",
        s["trend_label_churn_rate"],
        baseline_churn_rate,
        recent_churn_rate,
        "pp",
    ))

    deltas.append(_make_delta(
        "revert_rate",
        s["trend_label_revert_rate"],
        baseline.revert_rate * 100,
        recent.revert_rate * 100,
        "pp",
    ))

    # Intent shares (only when both have intent data)
    if baseline.commit_intent_distribution and recent.commit_intent_distribution:
        for intent, label_key in [
            ("FEATURE", "trend_label_feature_share"),
            ("FIX", "trend_label_fix_share"),
            ("CONFIG", "trend_label_config_share"),
        ]:
            deltas.append(_make_delta(
                f"{intent.lower()}_share",
                s[label_key],
                _intent_share(baseline, intent),
                _intent_share(recent, intent),
                "pp",
            ))

    # Stabilization by intent (only for intents with data in both windows)
    if baseline.stabilization_by_intent and recent.stabilization_by_intent:
        for intent, label_key in [
            ("FEATURE", "trend_label_feature_stabilization"),
            ("FIX", "trend_label_fix_stabilization"),
        ]:
            b_val = _intent_stabilization(baseline, intent)
            r_val = _intent_stabilization(recent, intent)
            if b_val is not None and r_val is not None:
                deltas.append(_make_delta(
                    f"{intent.lower()}_stabilization",
                    s[label_key],
                    b_val,
                    r_val,
                    "pp",
                ))

    # PR metrics (only when both have PR data)
    if (
        baseline.pr_merged_count is not None
        and recent.pr_merged_count is not None
    ):
        deltas.append(_make_delta(
            "pr_time_to_merge",
            s["trend_label_pr_time_to_merge"],
            baseline.pr_median_time_to_merge_hours,
            recent.pr_median_time_to_merge_hours,
            "h",
        ))

        deltas.append(_make_delta(
            "pr_single_pass",
            s["trend_label_pr_single_pass"],
            baseline.pr_single_pass_rate * 100,
            recent.pr_single_pass_rate * 100,
            "pp",
        ))

    return TrendResult(
        baseline_days=baseline_days,
        recent_days=recent_days,
        baseline_commits=baseline.commits_total,
        recent_commits=recent.commits_total,
        deltas=deltas,
        has_sufficient_data=True,
    )


# --- Attention Summary thresholds (v0.4a hypotheses) ---
DESTAB_STAB_THRESHOLD = -10.0      # stabilization delta below this → destabilizing
DESTAB_STAB_MILD = -5.0            # mild stab drop combined with feature stab collapse
DESTAB_FEAT_STAB_THRESHOLD = -15.0 # feature stab delta below this → destabilizing
STAB_UP_THRESHOLD = 10.0           # stabilization delta above this → stabilizing
STAB_UP_MILD = 5.0                 # mild stab up combined with churn down
CHURN_DOWN_THRESHOLD = -5.0        # churn delta below this → improving
FRICTION_TTM_THRESHOLD = 12.0      # PR TTM increase above this → friction
FRICTION_SPR_THRESHOLD = -15.0     # single-pass drop below this → friction
COMPOSITION_THRESHOLD = 15.0       # intent share shift above this → composition change


def _get_delta(trend: TrendResult, metric: str) -> MetricDelta | None:
    """Find a delta by metric name, or None."""
    for d in trend.deltas:
        if d.metric == metric:
            return d
    return None


def _is_not_stable(d: MetricDelta | None) -> bool:
    """True if delta exists and is notable or significant."""
    return d is not None and d.classification != "stable"


def detect_co_occurrences(trend: TrendResult) -> list[CoOccurrence]:
    """Detect co-occurrence patterns where multiple signals reinforce each other.

    Returns matched patterns. Each pattern consumes specific metric names
    so the narrative can avoid duplicating those as individual findings.
    """
    if not trend.has_sufficient_data:
        return []

    stab = _get_delta(trend, "stabilization_ratio")
    churn = _get_delta(trend, "churn_rate")
    feat_stab = _get_delta(trend, "feature_stabilization")
    fix_stab = _get_delta(trend, "fix_stabilization")
    pr_ttm = _get_delta(trend, "pr_time_to_merge")
    pr_spr = _get_delta(trend, "pr_single_pass")

    results: list[CoOccurrence] = []

    # Stability cascade: stab ↓ + churn ↑ + feature_stab ↓
    if (
        _is_not_stable(stab) and stab.delta < 0
        and _is_not_stable(churn) and churn.delta > 0
        and _is_not_stable(feat_stab) and feat_stab.delta < 0
    ):
        results.append(CoOccurrence(
            pattern="stability_cascade",
            metrics=["stabilization_ratio", "churn_rate", "feature_stabilization"],
            summary_key="cooccurrence_stability_cascade",
        ))

    # Fix instability: fix_stab ↓ + churn ↑ (only if not already in stability cascade)
    if (
        not any(c.pattern == "stability_cascade" for c in results)
        and _is_not_stable(fix_stab) and fix_stab.delta < 0
        and _is_not_stable(churn) and churn.delta > 0
    ):
        results.append(CoOccurrence(
            pattern="fix_instability",
            metrics=["fix_stabilization", "churn_rate"],
            summary_key="cooccurrence_fix_instability",
        ))

    # Workflow slowdown: pr_ttm ↑ + single_pass ↓
    if (
        _is_not_stable(pr_ttm) and pr_ttm.delta > 0
        and _is_not_stable(pr_spr) and pr_spr.delta < 0
    ):
        results.append(CoOccurrence(
            pattern="workflow_slowdown",
            metrics=["pr_time_to_merge", "pr_single_pass"],
            summary_key="cooccurrence_workflow_slowdown",
        ))

    # Recovery: stab ↑ + churn ↓
    if (
        _is_not_stable(stab) and stab.delta > 0
        and _is_not_stable(churn) and churn.delta < 0
    ):
        results.append(CoOccurrence(
            pattern="recovery",
            metrics=["stabilization_ratio", "churn_rate"],
            summary_key="cooccurrence_recovery",
        ))

    return results


def generate_attention_summary(trend: TrendResult, lang: str = "en") -> str:
    """Generate a 1-2 sentence attention summary describing the dominant trend pattern.

    Returns empty string when trend has insufficient data.
    """
    if not trend.has_sufficient_data:
        return ""

    s = get_strings(lang)

    stab = _get_delta(trend, "stabilization_ratio")
    churn = _get_delta(trend, "churn_rate")
    feat_stab = _get_delta(trend, "feature_stabilization")
    pr_ttm = _get_delta(trend, "pr_time_to_merge")
    pr_spr = _get_delta(trend, "pr_single_pass")

    # Check for destabilizing pattern
    is_destab = False
    if stab and stab.delta < DESTAB_STAB_THRESHOLD:
        is_destab = True
    if (
        stab and stab.delta < DESTAB_STAB_MILD
        and feat_stab and feat_stab.delta < DESTAB_FEAT_STAB_THRESHOLD
    ):
        is_destab = True

    if is_destab:
        parts = []
        if feat_stab and feat_stab.delta < 0 and feat_stab.classification != "stable":
            parts.append(f"{feat_stab.label} {feat_stab.delta:+.0f}pp")
        if stab:
            parts.append(f"{stab.label} {stab.baseline_value:.0f}% → {stab.recent_value:.0f}%")
        description = ", ".join(parts) if parts else f"{stab.label} {stab.delta:+.0f}pp"
        return s["attention_destabilizing"].format(description=description)

    # Check for stabilizing pattern
    is_stab = False
    if stab and stab.delta > STAB_UP_THRESHOLD:
        is_stab = True
    if (
        stab and stab.delta > STAB_UP_MILD
        and churn and churn.delta < CHURN_DOWN_THRESHOLD
    ):
        is_stab = True

    if is_stab:
        parts = []
        if stab:
            parts.append(f"{stab.label} {stab.delta:+.0f}pp")
        if churn and churn.delta < 0 and churn.classification != "stable":
            parts.append(f"{churn.label} {churn.delta:+.0f}pp")
        description = ", ".join(parts)
        return s["attention_stabilizing"].format(description=description)

    # Check for workflow friction
    is_friction = False
    if pr_ttm and pr_ttm.delta > FRICTION_TTM_THRESHOLD:
        is_friction = True
    if pr_spr and pr_spr.delta < FRICTION_SPR_THRESHOLD:
        is_friction = True

    if is_friction:
        parts = []
        if pr_ttm and pr_ttm.delta > 0 and pr_ttm.classification != "stable":
            parts.append(f"merge time {pr_ttm.delta:+.1f}h")
        if pr_spr and pr_spr.delta < 0 and pr_spr.classification != "stable":
            parts.append(f"single-pass rate {pr_spr.delta:+.0f}pp")
        description = ", ".join(parts)
        return s["attention_workflow_friction"].format(description=description)

    # Check for composition shift
    for d in trend.deltas:
        if d.metric.endswith("_share") and abs(d.delta) >= COMPOSITION_THRESHOLD:
            description = f"{d.label} {d.delta:+.0f}pp"
            return s["attention_composition_shift"].format(description=description)

    # Check for intent-level destabilization (feature/fix stability declining
    # significantly even when overall stabilization is stable)
    fix_stab = _get_delta(trend, "fix_stabilization")
    intent_destab_parts = []
    if feat_stab and feat_stab.classification == "significant" and feat_stab.delta < 0:
        intent_destab_parts.append(f"{feat_stab.label} {feat_stab.delta:+.0f}pp")
    if fix_stab and fix_stab.classification == "significant" and fix_stab.delta < 0:
        intent_destab_parts.append(f"{fix_stab.label} {fix_stab.delta:+.0f}pp")
    if intent_destab_parts:
        description = ", ".join(intent_destab_parts)
        return s["attention_destabilizing"].format(description=description)

    # Check if all stable
    non_stable = [d for d in trend.deltas if d.classification != "stable"]
    if not non_stable:
        return s["attention_stable"]

    # Mixed signals — significant deltas in opposing directions
    positive = [d for d in non_stable if d.delta > 0]
    negative = [d for d in non_stable if d.delta < 0]
    if positive and negative:
        pos_desc = ", ".join(f"{d.label} {d.delta:+.0f}{'h' if d.unit == 'h' else 'pp'}" for d in positive[:2])
        neg_desc = ", ".join(f"{d.label} {d.delta:+.0f}{'h' if d.unit == 'h' else 'pp'}" for d in negative[:2])
        return s["attention_mixed"].format(positive=pos_desc, negative=neg_desc)

    return ""
