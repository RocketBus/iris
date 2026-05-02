"""Organization-level models for cross-repo analysis."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from iris.models.metrics import ReportMetrics
from iris.models.trend import TrendResult

if TYPE_CHECKING:
    from iris.analysis.priming_detector import PrimingResult
    from iris.models.adoption import AdoptionResult


@dataclass(frozen=True)
class RepoResult:
    """Result of analyzing a single repository within an org."""

    repo_name: str
    metrics: ReportMetrics
    trend: TrendResult | None
    adoption: "AdoptionResult | None" = None
    priming: "PrimingResult | None" = None


@dataclass(frozen=True)
class AttentionSignal:
    """A cross-repo attention signal flagging a pattern worth investigating."""

    repository: str
    pattern: str        # "destabilizing", "workflow_friction", etc.
    details: list[str] = field(default_factory=list)  # per-signal descriptions
    summary: str = ""   # 1-sentence summary


@dataclass(frozen=True)
class OrgResult:
    """Aggregated result of analyzing all repositories in an organization."""

    org_name: str
    repos: list[RepoResult]
    change_attribution: str
    attention_signals: list[AttentionSignal]
    delivery_narrative: str
