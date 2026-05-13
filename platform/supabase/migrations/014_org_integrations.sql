-- 014_org_integrations.sql
-- Slice 2 of the Datadog integration (#15). Adds the multi-provider
-- integration table. Credentials are stored encrypted via pgcrypto's
-- pgp_sym_encrypt using a server-side master key (INTEGRATIONS_ENCRYPTION_KEY).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE integration_provider AS ENUM ('datadog');
CREATE TYPE integration_status AS ENUM ('active', 'error', 'disconnected');

CREATE TABLE org_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider integration_provider NOT NULL,
  status integration_status NOT NULL DEFAULT 'active',
  -- NULL when status = 'disconnected'. Otherwise a pgp_sym_encrypt-produced
  -- bytea of the JSON credential payload (e.g. {"api_key", "app_key", "site"}).
  credentials_encrypted BYTEA,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider)
);

CREATE INDEX idx_org_integrations_org ON org_integrations(organization_id);
CREATE INDEX idx_org_integrations_status_active ON org_integrations(status)
  WHERE status = 'active';

CREATE TRIGGER update_org_integrations_updated_at BEFORE UPDATE ON org_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Helper RPCs so the application layer never sees raw bytea or the master
-- key on the wire. Both functions are SECURITY INVOKER (default) and take
-- the master key as a parameter — the key lives in app env, not in the DB.
-- The application is responsible for passing INTEGRATIONS_ENCRYPTION_KEY.
--
-- Note on pgcrypto: Supabase installs pgcrypto into the `extensions`
-- schema (not `public`), so we schema-qualify the calls. `encode`/`decode`
-- are built-ins in `pg_catalog` and don't need qualification.

CREATE OR REPLACE FUNCTION encrypt_credentials(plaintext TEXT, master_key TEXT)
RETURNS TEXT
LANGUAGE sql
VOLATILE
AS $$
  SELECT encode(extensions.pgp_sym_encrypt(plaintext, master_key), 'base64');
$$;

CREATE OR REPLACE FUNCTION decrypt_credentials(encrypted TEXT, master_key TEXT)
RETURNS TEXT
LANGUAGE sql
VOLATILE
AS $$
  SELECT extensions.pgp_sym_decrypt(decode(encrypted, 'base64'), master_key);
$$;

-- Restrict the RPC surface to service-role only. Application code uses
-- supabaseAdmin (service role) for all integration writes; client-side
-- code should never reach these.
REVOKE ALL ON FUNCTION encrypt_credentials(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION decrypt_credentials(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
