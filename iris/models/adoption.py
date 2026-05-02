"""Adoption timeline models — AI adoption detection and before/after comparison."""

from dataclasses import dataclass
from datetime import datetime

from iris.models.metrics import ReportMetrics
from iris.models.trend import TrendResult


@dataclass(frozen=True)
class AdoptionEvent:
    """Detected AI adoption inflection point in a repository."""

    first_ai_commit_date: datetime
    adoption_ramp_start: datetime      # same as first_ai_commit_date
    adoption_ramp_end: datetime | None  # when 3+ AI commits in any 30-day window
    adoption_confidence: str           # "clear" | "sparse" | "insufficient"
    total_ai_commits: int


@dataclass(frozen=True)
class AdoptionResult:
    """Complete adoption analysis: event + before/after metrics comparison."""

    event: AdoptionEvent
    pre_metrics: ReportMetrics
    post_metrics: ReportMetrics
    comparison: TrendResult
    pre_days: int
    post_days: int
