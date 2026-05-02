"""Commit shape models — structural profile of changes."""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ShapeProfile:
    """Aggregated shape metrics for a group of commits (e.g., per origin)."""

    origin: str
    commit_count: int
    median_files_changed: float
    median_total_lines: float
    median_lines_per_file: float
    median_directory_spread: float
    dominant_shape: str  # "focused" | "spread" | "bulk" | "surgical"


@dataclass(frozen=True)
class ShapeResult:
    """Complete commit shape analysis."""

    overall_profile: ShapeProfile
    profiles_by_origin: list[ShapeProfile] = field(default_factory=list)
