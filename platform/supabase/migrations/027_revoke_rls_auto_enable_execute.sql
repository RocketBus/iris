-- Closes the last open Supabase linter finding: `rls_auto_enable()` carried
-- EXECUTE for PUBLIC/anon/authenticated.
--
-- This is a Supabase-installed default (confirmed via pg_event_trigger: the
-- `ensure_rls` event trigger, enabled, fires it on every ddl_command_end —
-- not something this project added). It RETURNS event_trigger, which
-- Postgres only lets the event-trigger machinery invoke; calling it via
-- `/rest/v1/rpc/rls_auto_enable` errors before doing anything, regardless of
-- this grant. Revoking is pure hygiene: no functional change, just silences
-- the linter and drops an unused grant.
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

insert into supabase_migrations.schema_migrations (version, name)
values ('027', 'revoke_rls_auto_enable_execute')
on conflict (version) do nothing;
