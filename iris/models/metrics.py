"""Metrics data structures shared across Iris modules."""

from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class ReportMetrics:
    """All metrics produced by a Iris analysis run.

    PR fields are optional — None when PR data is unavailable.
    """

    commits_total: int
    commits_revert: int
    revert_rate: float
    churn_events: int
    churn_lines_affected: int
    files_touched: int
    files_stabilized: int
    stabilization_ratio: float

    # Revert attribution (optional — None when no reverts or no origin data)
    revert_by_origin: dict[str, dict] | None = None
    revert_by_tool: dict[str, dict] | None = None

    # Fix targeting (optional — None when insufficient fix events)
    fix_target_by_origin: dict[str, dict] | None = None
    fix_target_by_tool: dict[str, dict] | None = None

    # Intent classification metrics (always populated in v0.2+)
    commit_intent_distribution: dict[str, int] | None = None
    churn_by_intent: dict[str, dict] | None = None
    stabilization_by_intent: dict[str, dict] | None = None
    lines_changed_by_intent: dict[str, int] | None = None

    # Origin classification metrics (optional — None when no non-human commits)
    ai_detection_coverage_pct: float | None = None  # % of commits with AI attribution
    commit_origin_distribution: dict[str, int] | None = None
    stabilization_by_origin: dict[str, dict] | None = None
    churn_by_origin: dict[str, dict] | None = None

    # Commit shape metrics (optional — None when no non-merge commits)
    commit_shape_by_origin: dict[str, dict] | None = None
    commit_shape_dominant: str | None = None

    # Fix latency metrics (optional — None when no rework events detected)
    fix_latency_median_hours: float | None = None
    fix_latency_by_origin: dict[str, dict] | None = None

    # Stability map (optional — None when no directories meet minimum threshold)
    stability_map: list[dict] | None = None

    # Correction cascade metrics (optional — None when insufficient data)
    cascade_rate: float | None = None
    cascade_rate_by_origin: dict[str, dict] | None = None
    cascade_rate_by_tool: dict[str, dict] | None = None
    cascade_median_depth: float | None = None

    # Code durability metrics (optional — None when git blame data unavailable)
    durability_by_origin: dict[str, dict] | None = None
    durability_by_tool: dict[str, dict] | None = None
    durability_files_analyzed: int | None = None

    # Acceptance rate metrics (optional — None when PR commit data unavailable)
    acceptance_by_origin: dict[str, dict] | None = None
    acceptance_by_tool: dict[str, dict] | None = None

    # Origin funnel (optional — None when origin data unavailable)
    origin_funnel: dict[str, dict] | None = None

    # Attribution gap (optional — None when no flagged commits)
    attribution_gap: dict | None = None

    # Churn detail (optional — None when insufficient churning files)
    churn_top_files: list[dict] | None = None
    churn_couplings: list[dict] | None = None

    # Activity timeline (optional — None when fewer than 2 weeks of data)
    activity_timeline: list[dict] | None = None
    activity_patterns: list[dict] | None = None

    # PR lifecycle metrics (optional — None when no GitHub data available)
    pr_merged_count: int | None = None
    pr_median_time_to_merge_hours: float | None = None
    pr_median_size_files: int | None = None
    pr_median_size_lines: int | None = None
    pr_review_rounds_median: float | None = None
    pr_single_pass_rate: float | None = None

    # Duplicate block detection (optional — None when diff data unavailable)
    duplicate_block_rate: float | None = None
    duplicate_block_count: int | None = None
    duplicate_median_block_size: float | None = None
    duplicate_by_origin: dict[str, dict] | None = None
    duplicate_by_tool: dict[str, dict] | None = None

    # Moved code / refactoring health (optional — None when diff data unavailable)
    moved_code_pct: float | None = None
    refactoring_ratio: float | None = None
    move_by_origin: dict[str, dict] | None = None

    # Code provenance (optional — None when blame data unavailable)
    revision_age_distribution: dict[str, float] | None = None
    pct_revising_new_code: float | None = None
    pct_revising_mature_code: float | None = None
    provenance_by_origin: dict[str, dict] | None = None

    # New code churn rate (optional — None when insufficient data)
    new_code_churn_rate_2w: float | None = None
    new_code_churn_rate_4w: float | None = None
    new_code_churn_by_origin: dict[str, dict] | None = None
    new_code_churn_by_tool: dict[str, dict] | None = None

    # Operation classification (optional — None when diff data unavailable)
    operation_distribution: dict[str, float] | None = None
    operation_dominant: str | None = None
    operation_by_origin: dict[str, dict] | None = None

    # Flow Load — WIP per ISO week (optional — None when <2 buckets emerge)
    flow_load: list[dict] | None = None

    def to_dict(self) -> dict:
        d = asdict(self)
        # Exclude None fields for backward compatibility
        return {k: v for k, v in d.items() if v is not None}
