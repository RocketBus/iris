"""Fix latency models — time-to-rework metrics."""

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class ReworkEvent:
    """A single file rework: consecutive modification within the churn window."""

    file_path: str
    original_commit_hash: str
    original_date: datetime
    original_origin: str  # CommitOrigin.value
    rework_commit_hash: str
    rework_date: datetime
    rework_origin: str  # CommitOrigin.value
    latency_hours: float


@dataclass(frozen=True)
class FixLatencyByOrigin:
    """Fix latency metrics for a single origin."""

    origin: str
    median_latency_hours: float
    fast_rework_pct: float  # % of reworks < 72h
    rework_count: int


@dataclass(frozen=True)
class FixLatencyResult:
    """Complete fix latency analysis."""

    rework_events: list[ReworkEvent] = field(default_factory=list)
    median_latency_hours: float = 0.0
    p25_latency_hours: float = 0.0
    p75_latency_hours: float = 0.0
    fast_rework_count: int = 0   # < 72h (3 days)
    medium_rework_count: int = 0  # 72h - 168h (3-7 days)
    slow_rework_count: int = 0   # > 168h (7+ days)
    by_origin: list[FixLatencyByOrigin] = field(default_factory=list)
