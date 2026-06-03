-- Merge Strategy detection (issue #76): per-repository classification of how
-- PRs land on the default branch, plus a per-commit reliability flag. These
-- mirror the engine's `merge_strategy` / `commit_metrics_reliable` fields and
-- are indexed on `metrics` (alongside cascade_rate, ai_detection_coverage_pct,
-- etc.) so the compare view can surface them without reading the full JSONB
-- payload. The full payload still carries `merge_strategy_dominant_share`.
ALTER TABLE metrics
  ADD COLUMN merge_strategy TEXT,
  ADD COLUMN commit_metrics_reliable BOOLEAN;
