-- Track active commit authors per analysis run.
ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS active_users JSONB;
