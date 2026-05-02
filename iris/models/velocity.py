"""Velocity and velocity-durability correlation models."""

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class VelocityWindow:
    """Metrics for a single time window."""

    window_start: datetime
    window_end: datetime
    commits_count: int
    lines_changed: int
    files_touched: int
    commits_per_week: float
    lines_per_week: float
    unique_authors: int


@dataclass(frozen=True)
class VelocityDurabilityPoint:
    """A single window with both velocity and durability metrics."""

    window_start: datetime
    window_end: datetime
    commits_per_week: float
    stabilization_ratio: float
    churn_rate: float


@dataclass(frozen=True)
class VelocityResult:
    """Complete velocity analysis with optional durability correlation."""

    windows: list[VelocityWindow] = field(default_factory=list)
    overall_commits_per_week: float = 0.0
    overall_lines_per_week: float = 0.0
    velocity_trend: str = "stable"  # "accelerating" | "stable" | "decelerating"
    velocity_change_pct: float = 0.0  # % change first half vs second half

    # Velocity-durability correlation
    correlation_points: list[VelocityDurabilityPoint] = field(default_factory=list)
    correlation_direction: str = "neutral"  # "positive" | "negative" | "neutral"
