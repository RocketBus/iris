-- Iris-specific tables for engineering intelligence
-- These tables extend the scaffolding schema with repository analysis capabilities

-- repositories
CREATE TABLE repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  remote_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, name)
);

CREATE INDEX idx_repositories_org ON repositories(organization_id);

CREATE TRIGGER update_repositories_updated_at BEFORE UPDATE ON repositories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- analysis_runs
CREATE TABLE analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  window_days INTEGER NOT NULL,
  commits_total INTEGER NOT NULL,
  cli_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analysis_runs_repo ON analysis_runs(repository_id, created_at DESC);
CREATE INDEX idx_analysis_runs_org ON analysis_runs(organization_id, created_at DESC);

-- metrics (full payload + indexed columns for temporal queries)
CREATE TABLE metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,

  -- Full payload as JSONB
  payload JSONB NOT NULL,

  -- Indexed columns for temporal queries and dashboards
  stabilization_ratio FLOAT,
  revert_rate FLOAT,
  churn_events INTEGER,
  commits_total INTEGER,
  ai_detection_coverage_pct FLOAT,
  pr_merged_count INTEGER,
  pr_single_pass_rate FLOAT,
  fix_latency_median_hours FLOAT,
  cascade_rate FLOAT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_metrics_repo_time ON metrics(repository_id, created_at DESC);
CREATE INDEX idx_metrics_org_time ON metrics(organization_id, created_at DESC);
CREATE INDEX idx_metrics_run ON metrics(analysis_run_id);

-- api_tokens for CLI authentication
-- Note: references users(id) from scaffolding schema, not auth.users(id)
CREATE TABLE api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,  -- "iris_abc1..." for display
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_api_tokens_org ON api_tokens(organization_id);
CREATE INDEX idx_api_tokens_hash ON api_tokens(token_hash) WHERE revoked_at IS NULL;
