-- 015_external_deployments.sql
-- Slice 3 of the Datadog integration (#15). Persists raw DORA deployment
-- events pulled by the daily sync from POST /api/v2/dora/deployments.
-- Schema matches the probed payload (see docs/PLAN-datadog.md §9.2).

CREATE TABLE external_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider integration_provider NOT NULL,
  -- Datadog's event id (e.g. "43vkaZNgiso"). Idempotency key for upsert.
  provider_event_id TEXT NOT NULL,
  -- Matched Iris repo when DD's repository_id slug resolves to a tracked
  -- repo; NULL otherwise. Match logic normalizes both sides.
  repository_id UUID REFERENCES repositories(id) ON DELETE SET NULL,
  -- Raw DD slug "github.com/<org>/<repo>", stored for debuggability when
  -- the match fails.
  dd_repository_id TEXT,
  service TEXT,
  env TEXT,
  team TEXT,
  version TEXT,
  commit_sha TEXT,
  -- Tri-state: TRUE | FALSE | NULL. NULL = Datadog hasn't evaluated yet.
  -- CFR denominator must exclude NULL rows; surface as "pending" in UI.
  change_failure BOOLEAN,
  deployment_type TEXT,
  source TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  number_of_commits INTEGER,
  number_of_pull_requests INTEGER,
  -- Present only when change_failure = TRUE.
  recovery_time_sec INTEGER,
  remediation_type TEXT,
  remediation_id TEXT,
  raw JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

CREATE INDEX idx_external_deployments_org_started
  ON external_deployments(organization_id, started_at DESC);
CREATE INDEX idx_external_deployments_repo_started
  ON external_deployments(repository_id, started_at DESC)
  WHERE repository_id IS NOT NULL;
CREATE INDEX idx_external_deployments_commit_sha
  ON external_deployments(commit_sha)
  WHERE commit_sha IS NOT NULL;
