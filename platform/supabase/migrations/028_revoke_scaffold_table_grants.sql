-- Extends 026's fix to the four original auth-scaffold tables
-- (organizations, users, organization_members, invitations), which were
-- left alone there because they already have RLS + policies from
-- 001_initial_schema.sql.
--
-- Those policies assume Supabase Auth's `auth.uid()`/`auth.role()`, which
-- this NextAuth-based app never populates (confirmed: no code anywhere
-- imports the anon-key `supabase` client — every access goes through
-- `supabaseAdmin`, the service-role client, which bypasses RLS and grants
-- alike). A policy that can never match isn't a safety net, and one of
-- them doesn't even try to match anything:
--
--   CREATE POLICY "Anyone can view invitations by token" ON invitations
--     FOR SELECT USING (true);
--
-- `USING (true)` permits every row to every role the policy applies to,
-- unconditionally. Paired with the default anon/authenticated grants these
-- tables never had revoked, this exposed every organization's pending
-- invitations — including the `token` column used to join one — to
-- anyone, no authentication required.
--
-- Same fix as 026: revoke the grants outright rather than depend on
-- RLS policies whose correctness depends on an auth mechanism this app
-- doesn't use. The policies themselves are left in place — harmless, and
-- documentation of intent if Supabase Auth is ever wired up for real.

REVOKE ALL ON TABLE organizations FROM anon, authenticated;
REVOKE ALL ON TABLE users FROM anon, authenticated;
REVOKE ALL ON TABLE organization_members FROM anon, authenticated;
REVOKE ALL ON TABLE invitations FROM anon, authenticated;

insert into supabase_migrations.schema_migrations (version, name)
values ('028', 'revoke_scaffold_table_grants')
on conflict (version) do nothing;
