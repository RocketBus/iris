-- Cache of a GitHub org's members. These aren't Iris users — they
-- are external identities surfaced in admin views. Kept in
-- a separate table because organization_members models Iris accounts with
-- roles and status, which doesn't apply here.
CREATE TABLE IF NOT EXISTS github_org_members (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  github_user_id BIGINT NOT NULL,
  github_login TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, github_user_id)
);

CREATE INDEX IF NOT EXISTS idx_github_org_members_login
  ON github_org_members(organization_id, lower(github_login));

CREATE INDEX IF NOT EXISTS idx_github_org_members_synced_at
  ON github_org_members(organization_id, synced_at DESC);
