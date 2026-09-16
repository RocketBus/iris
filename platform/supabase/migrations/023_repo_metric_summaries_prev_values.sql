-- Extends repo_metric_summaries with the previous run's values for the
-- metrics getOrgChangeDetections compares (revert_rate, churn_events,
-- ai_detection_coverage_pct) plus the previous run's timestamp.
--
-- getOrgChangeDetections used to fetch the org's repos, then loop over them
-- issuing one `metrics` query per repo (limit 2, newest-first) to compare
-- the latest run against the one before it — an N+1 that scales linearly
-- with repo count and serializes one round-trip per repo.
--
-- The view already computes prev_stabilization_ratio ([2] = second-newest)
-- for the sparkline delta arrow; extending it with the same [2] slot for
-- the other compared metrics lets getOrgChangeDetections read one
-- pre-aggregated row per repo instead of looping, mirroring the same
-- "2 bulk queries instead of N+1" fix getOrgReposSummary already uses
-- against this view (see 022_repo_metric_summaries.sql).

CREATE OR REPLACE VIEW repo_metric_summaries AS
SELECT
  repository_id,
  organization_id,
  window_days,

  count(*)                                                            AS runs_count,
  max(created_at)                                                     AS last_run_at,

  -- Latest run's indexed values ([1] = newest by created_at).
  (array_agg(stabilization_ratio       ORDER BY created_at DESC))[1]  AS stabilization_ratio,
  (array_agg(revert_rate               ORDER BY created_at DESC))[1]  AS revert_rate,
  (array_agg(churn_events              ORDER BY created_at DESC))[1]  AS churn_events,
  (array_agg(commits_total             ORDER BY created_at DESC))[1]  AS commits_total,
  (array_agg(ai_detection_coverage_pct ORDER BY created_at DESC))[1]  AS ai_detection_coverage_pct,
  (array_agg(pr_merged_count           ORDER BY created_at DESC))[1]  AS pr_merged_count,
  (array_agg(pr_single_pass_rate       ORDER BY created_at DESC))[1]  AS pr_single_pass_rate,
  (array_agg(fix_latency_median_hours  ORDER BY created_at DESC))[1]  AS fix_latency_median_hours,
  (array_agg(cascade_rate              ORDER BY created_at DESC))[1]  AS cascade_rate,
  (array_agg(merge_strategy            ORDER BY created_at DESC))[1]  AS merge_strategy,
  (array_agg(commit_metrics_reliable   ORDER BY created_at DESC))[1]  AS commit_metrics_reliable,

  -- Previous run's values ([2] = second newest) for the change-detection
  -- current-vs-previous comparison in getOrgChangeDetections.
  (array_agg(created_at                ORDER BY created_at DESC))[2]  AS prev_created_at,
  (array_agg(stabilization_ratio       ORDER BY created_at DESC))[2]  AS prev_stabilization_ratio,
  (array_agg(revert_rate               ORDER BY created_at DESC))[2]  AS prev_revert_rate,
  (array_agg(churn_events              ORDER BY created_at DESC))[2]  AS prev_churn_events,
  (array_agg(ai_detection_coverage_pct ORDER BY created_at DESC))[2]  AS prev_ai_detection_coverage_pct,

  -- Newest-first stabilization values; the caller slices SPARKLINE_POINTS,
  -- reverses to chronological, and drops nulls. 50 is more than any sparkline
  -- needs while keeping the array small.
  (array_agg(stabilization_ratio       ORDER BY created_at DESC))[1:50] AS recent_stabilization

FROM metrics
GROUP BY repository_id, organization_id, window_days;
