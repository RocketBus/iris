-- Hardens findings from the Supabase security linter surfaced while
-- debugging the dashboard reliability fixes (024).
--
-- 1. repo_metric_summaries (ERROR: security_definer_view). A view with no
--    explicit `security_invoker` runs with the privileges of its OWNER for
--    every querying role, not the querying role's own — so if `anon` or
--    `authenticated` were ever granted SELECT on it directly (bypassing our
--    app's supabaseAdmin/service-role path), it would read straight through
--    any RLS on the underlying `metrics`/`repositories` tables. Setting
--    security_invoker = on makes the view re-check RLS as the querying role,
--    same as querying the base tables directly. No effect on supabaseAdmin
--    (service_role already bypasses RLS regardless of this setting).
ALTER VIEW repo_metric_summaries SET (security_invoker = on);

-- 2. Function search_path mutable (WARN, x4). Without a pinned search_path,
--    a SECURITY DEFINER or elevated-privilege function resolves unqualified
--    identifiers against whatever search_path the CALLING session has set,
--    letting a caller shadow a table/function the definition relies on.
--    `encrypt_credentials`/`decrypt_credentials` call `extensions.pgp_sym_*`
--    explicitly, but pin search_path anyway for defense in depth; the other
--    two only touch `public` objects.
ALTER FUNCTION update_updated_at_column() SET search_path = public;
ALTER FUNCTION encrypt_credentials(TEXT, TEXT) SET search_path = public, extensions;
ALTER FUNCTION decrypt_credentials(TEXT, TEXT) SET search_path = public, extensions;
ALTER FUNCTION ingest_usage_rollup(
  UUID, UUID, DATE, TEXT, TEXT, TEXT,
  BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT
) SET search_path = public;

-- 3. ingest_usage_rollup was missing the same PUBLIC/anon/authenticated
--    revoke encrypt_credentials/decrypt_credentials already had (see 014).
--    It writes directly to usage_rollup keyed by caller-supplied
--    organization_id/repository_id with no identity check of its own —
--    the org boundary is enforced by api/ingest/usage's token lookup one
--    layer up, in application code, which always calls it via supabaseAdmin
--    (service role). Left open, anyone could call
--    /rest/v1/rpc/ingest_usage_rollup directly and inject usage data into
--    any org's dashboard.
REVOKE ALL ON FUNCTION ingest_usage_rollup(
  UUID, UUID, DATE, TEXT, TEXT, TEXT,
  BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT
) FROM PUBLIC, anon, authenticated;

insert into supabase_migrations.schema_migrations (version, name)
values ('025', 'security_hardening')
on conflict (version) do nothing;
