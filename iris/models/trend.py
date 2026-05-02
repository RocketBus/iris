"""Trend analysis models — temporal comparison of metrics across windows."""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class MetricDelta:
    """A single metric's change between baseline and recent windows."""

    metric: str  # e.g., "stabilization_ratio"
    label: str  # human-readable label, e.g., "Stabilization"
    baseline_value: float
    recent_value: float
    delta: float  # recent - baseline
    classification: str  # "stable", "notable", "significant"
    unit: str = ""  # "pp", "h", "%", "" — controls formatting


@dataclass(frozen=True)
class CoOccurrence:
    """A detected co-occurrence pattern where multiple signals reinforce each other."""

    pattern: str          # "stability_cascade", "fix_instability", etc.
    metrics: list[str] = field(default_factory=list)  # metric names involved
    summary_key: str = ""  # i18n key for the connected finding


@dataclass(frozen=True)
class TrendResult:
    """Result of comparing baseline vs recent analysis windows."""

    baseline_days: int
    recent_days: int
    baseline_commits: int
    recent_commits: int
    deltas: list[MetricDelta] = field(default_factory=list)
    has_sufficient_data: bool = True  # False when recent < MIN_COMMITS
