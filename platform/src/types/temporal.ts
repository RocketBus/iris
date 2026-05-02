/**
 * Types for temporal intelligence — trends, comparisons, change detection.
 */

/** A single point in a time series (one analysis run). */
export interface TimeSeriesPoint {
  date: string; // ISO date
  stabilization_ratio: number | null;
  revert_rate: number | null;
  churn_events: number | null;
  commits_total: number | null;
  ai_detection_coverage_pct: number | null;
  pr_merged_count: number | null;
  pr_single_pass_rate: number | null;
  fix_latency_median_hours: number | null;
  cascade_rate: number | null;
}

/** Summary of a repo's current state + trend. */
export interface RepoSummary {
  id: string;
  name: string;
  remote_url: string | null;
  last_run_at: string | null;
  runs_count: number;
  // Latest values
  stabilization_ratio: number | null;
  revert_rate: number | null;
  churn_events: number | null;
  commits_total: number | null;
  ai_detection_coverage_pct: number | null;
  pr_merged_count: number | null;
  pr_single_pass_rate: number | null;
  fix_latency_median_hours: number | null;
  cascade_rate: number | null;
  // Delta vs previous run
  stabilization_delta: number | null;
  // Health classification
  health: "healthy" | "warning" | "critical" | "unknown";
  // Sparkline data (last N stabilization values)
  sparkline: number[];
}

/** AI impact data point — origin-disaggregated metrics from one analysis run. */
export interface AIImpactPoint {
  date: string;
  ai_pct: number | null;
  // Stabilization
  stabilization_human: number | null;
  stabilization_ai: number | null;
  // Durability (survival rate)
  durability_human: number | null;
  durability_ai: number | null;
  // Cascade rate
  cascade_human: number | null;
  cascade_ai: number | null;
  // Commit counts
  commits_human: number | null;
  commits_ai: number | null;
}

/** A detected change between two consecutive runs. */
export interface ChangeDetection {
  repository_name: string;
  repository_id: string;
  metric: string;
  description: string;
  severity: "info" | "warning" | "critical";
  current_value: number;
  previous_value: number;
  delta: number;
}

/** Health classification thresholds. */
export function classifyHealth(stabilization: number | null): RepoSummary["health"] {
  if (stabilization === null) return "unknown";
  if (stabilization >= 0.6) return "healthy";
  if (stabilization >= 0.4) return "warning";
  return "critical";
}

/** Health indicator emoji. */
export function healthIndicator(health: RepoSummary["health"]): string {
  switch (health) {
    case "healthy": return "green";
    case "warning": return "yellow";
    case "critical": return "red";
    default: return "gray";
  }
}
