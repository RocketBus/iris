-- Track who submitted and who contributed to each analysis run.
ALTER TABLE analysis_runs ADD COLUMN github_user TEXT;
ALTER TABLE analysis_runs ADD COLUMN active_users JSONB;
CREATE INDEX idx_analysis_runs_github_user ON analysis_runs(github_user);
