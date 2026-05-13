-- 016_external_deployment_commits.sql
-- Slice 3 of the Datadog integration (#15). Per-commit detail unpacked
-- from attributes.commits[] on each DORA deployment event. This is the
-- join key for the AI-vs-human CFR correlation (PR 5): join on
-- commit_sha against the engine's commit_origin classifier output.

CREATE TABLE external_deployment_commits (
  deployment_id UUID NOT NULL REFERENCES external_deployments(id) ON DELETE CASCADE,
  commit_sha TEXT NOT NULL,
  commit_timestamp TIMESTAMPTZ,
  author_email TEXT,
  -- Datadog's canonicalized form (lowercased, alias-resolved); preferred
  -- for cross-referencing against Iris's commit_origin author field.
  author_canonical_email TEXT,
  is_bot BOOLEAN,
  -- Both in seconds. Per Datadog's DORA event payload.
  change_lead_time INTEGER,
  time_to_deploy INTEGER,
  PRIMARY KEY (deployment_id, commit_sha)
);

CREATE INDEX idx_external_deployment_commits_sha
  ON external_deployment_commits(commit_sha);
