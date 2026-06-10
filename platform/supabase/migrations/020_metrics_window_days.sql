-- Issue #80 prerequisite: denormalize `window_days` into `metrics` so reads
-- can filter by analysis window without a join against `analysis_runs`.
--
-- Today every temporal query (getRepoTimeSeries, getRepoAITimeSeries,
-- getOrgReposSummary, detectChanges, getOrgChangeDetections) selects from
-- `metrics` ignoring window_days. Once any tenant starts ingesting more than
-- one analysis window per repo (the goal of #80) those queries would silently
-- mix 7d and 90d points on the same sparkline. Carrying the column on
-- `metrics` lets the filter live in the WHERE clause; the composite index
-- keeps "latest N runs at window W per repo" cheap.
--
-- Default of 90 matches the CLI's `iris analyze --days` default and is the
-- safest backfill for historical rows: every payload ingested before this
-- migration was produced under that default (callers couldn't override it
-- through `/api/ingest`). NOT NULL once backfilled.

ALTER TABLE metrics
  ADD COLUMN window_days INTEGER;

-- Backfill from the parent analysis_run, falling back to 90 if a metric row
-- somehow lost its run (it shouldn't — ON DELETE CASCADE — but defensive).
UPDATE metrics
SET window_days = COALESCE(
  (SELECT window_days FROM analysis_runs WHERE analysis_runs.id = metrics.analysis_run_id),
  90
);

ALTER TABLE metrics
  ALTER COLUMN window_days SET NOT NULL;

ALTER TABLE metrics
  ALTER COLUMN window_days SET DEFAULT 90;

-- Composite index supports the canonical access pattern:
-- "latest N runs at window W per repo" (ordered by created_at DESC).
CREATE INDEX idx_metrics_repo_window_time
  ON metrics(repository_id, window_days, created_at DESC);

-- Org-wide variant for dashboard queries that fan out across repos.
CREATE INDEX idx_metrics_org_window_time
  ON metrics(organization_id, window_days, created_at DESC);
