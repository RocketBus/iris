-- Closes a critical cross-tenant exposure: every Iris-specific table
-- (everything except the original auth-scaffold tables from 001, which
-- already have RLS + policies) was created with Supabase's default grants
-- intact — full SELECT/INSERT/UPDATE/DELETE/TRUNCATE for both `anon`
-- (unauthenticated) and `authenticated`, and RLS was never enabled on any
-- of them. Confirmed via information_schema.role_table_grants against the
-- live project (2026-09-30).
--
-- Concretely, before this migration, an unauthenticated request straight to
-- PostgREST (no NextAuth session, no API token) could read or write any
-- organization's `metrics`/`repositories`/`analysis_runs`, forge or delete
-- rows in `api_tokens`, read/tamper with `org_integrations` (which holds
-- encrypted third-party credentials), and — worse — read/delete
-- `sessions`, `refresh_tokens`, and `two_factor_codes` directly: session
-- hijacking and 2FA bypass with zero authentication of its own.
--
-- The app never uses the anon/authenticated Supabase client against any
-- table (confirmed: no `import ... supabase ... from "@/lib/supabase"`
-- outside `supabaseAdmin`, which is the service-role client and bypasses
-- both grants and RLS regardless of what's set here) — every one of these
-- revokes and RLS-enables is a pure hardening with no functional effect on
-- the platform itself.
--
-- The four original scaffold tables (organizations, users,
-- organization_members, invitations) are deliberately left alone here:
-- they already have RLS + policies from 001, and touching their grants is
-- a separate decision (those policies assume Supabase Auth's `auth.uid()`,
-- which this app — NextAuth-based — never populates; worth its own pass).

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'sessions',
    'two_factor_codes',
    'refresh_tokens',
    'audit_logs',
    'repositories',
    'analysis_runs',
    'metrics',
    'api_tokens',
    'github_org_members',
    'org_integrations',
    'external_deployments',
    'external_deployment_commits',
    'external_incidents',
    'usage_rollup',
    'usage_dedup',
    'project_boards',
    'project_items',
    'project_status_events'
  ])
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE %I FROM anon, authenticated', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

insert into supabase_migrations.schema_migrations (version, name)
values ('026', 'revoke_public_grants')
on conflict (version) do nothing;
