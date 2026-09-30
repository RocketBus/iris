-- Extends repo_metric_summaries with:
--
-- 1. `payload` — the latest run's full JSONB payload, one row per repo.
--    getOrgLatestPayloads used to read raw `metrics` rows for the whole org
--    with a single `.limit(repoIds.length * 2)`, ordered globally by
--    created_at and deduplicated client-side to "first row seen per repo".
--    That breaks the same way the pre-fix getOrgReposSummary did (see
--    022_repo_metric_summaries.sql): a burst of re-analyses on a handful of
--    repos, or PostgREST's default 1000-row response cap, can push another
--    repo's actual latest row out of the fetched window entirely — that
--    repo then has NO entry in the payloads map, and every panel built on
--    it (AI Delivery Timeline, Org Timeline, ...) silently renders as if
--    that repo never had data, instead of erroring. Reading `payload` off
--    this view guarantees one row per repo regardless of run-count skew,
--    the same guarantee getOrgReposSummary already relies on for its own
--    columns.
--
-- 2. `prev_revert_rate`, `prev_churn_events`, `prev_ai_detection_coverage_pct`,
--    `prev_created_at` — the previous run's values for the metrics
--    `detectChanges` compares, so `getOrgChangeDetections` (feeds
--    ChangeAlertPanel) can also read one pre-aggregated row per repo instead
--    of looping over `metrics` with one query per repo (an N+1 that scales
--    linearly with repo count and can stall that panel's stream, or the
--    whole page, on large orgs). Mirrors `prev_stabilization_ratio`, which
--    the view already had for the sparkline delta arrow.

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
  (array_agg(stabilization_ratio       ORDER BY created_at DESC))[1:50] AS recent_stabilization,

  -- Everything below is new in this migration. `CREATE OR REPLACE VIEW`
  -- requires every pre-existing column to keep its name AND ordinal
  -- position — only appending at the end is allowed, or Postgres errors
  -- with "cannot change name of view column X to Y" (it reads a shifted
  -- position as a rename). So new columns are appended here, never
  -- interleaved with the columns above.
  (array_agg(payload                   ORDER BY created_at DESC))[1]  AS payload,
  (array_agg(created_at                ORDER BY created_at DESC))[2]  AS prev_created_at,
  (array_agg(revert_rate               ORDER BY created_at DESC))[2]  AS prev_revert_rate,
  (array_agg(churn_events              ORDER BY created_at DESC))[2]  AS prev_churn_events,
  (array_agg(ai_detection_coverage_pct ORDER BY created_at DESC))[2]  AS prev_ai_detection_coverage_pct

FROM metrics
GROUP BY repository_id, organization_id, window_days;
