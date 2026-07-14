-- One pre-aggregated summary row per (repository, window_days).
--
-- Fixes the "repos showing 0 runs" bug: getOrgReposSummary used to fetch raw
-- `metrics` rows for the whole org with a global `.limit(n_repos * 15)` and
-- group them client-side. PostgREST caps every response at the project's
-- "Max rows" (default 1000), so once an org had > 1000 metric rows in a window
-- only the newest 1000 came back. Repos whose latest run fell outside that
-- newest-1000 slice received zero rows and rendered "0 runs" despite having
-- metrics — purely a read-side truncation, not missing data.
--
-- Aggregating to one row per repo makes the result set ~= repo count (well under
-- any Max rows cap) and moves the "latest / previous / count / sparkline"
-- computation into the database. Reads become a plain filtered SELECT on the
-- view, no global row limit involved.
--
-- Predicates on organization_id / window_days (both GROUP BY keys) push below
-- the aggregate, so the existing idx_metrics_org_window_time index is used and
-- only the requested partition is scanned.

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

  -- Previous run's stabilization ([2] = second newest) for the delta arrow.
  (array_agg(stabilization_ratio       ORDER BY created_at DESC))[2]  AS prev_stabilization_ratio,

  -- Newest-first stabilization values; the caller slices SPARKLINE_POINTS,
  -- reverses to chronological, and drops nulls. 50 is more than any sparkline
  -- needs while keeping the array small.
  (array_agg(stabilization_ratio       ORDER BY created_at DESC))[1:50] AS recent_stabilization

FROM metrics
GROUP BY repository_id, organization_id, window_days;
