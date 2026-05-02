-- Link Iris organizations to a GitHub organization.
-- Both columns are nullable so manual orgs (pre-GitHub-native flow) keep working.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS github_org_id BIGINT,
  ADD COLUMN IF NOT EXISTS github_org_login TEXT;

-- One Iris org per GitHub org. NULLs are allowed (manual orgs) and ignored
-- by the unique constraint via a partial index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_github_org_id
  ON organizations(github_org_id)
  WHERE github_org_id IS NOT NULL;
