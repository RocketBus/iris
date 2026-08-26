/**
 * Pure repo-slug normalization — no dependencies, safe to import from
 * client components. Kept out of lib/integrations/datadog/sync.ts (which
 * originally defined it) because that module transitively imports
 * lib/supabase.ts (server-only, uses next/headers); a client component
 * importing anything from that file at all pulls the whole server-only
 * chain into the browser bundle and fails the build.
 */
export function normalizeRepoSlug(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  // git@github.com:org/repo.git → github.com/org/repo
  s = s.replace(/^git@([^:]+):/, "$1/");
  // ssh://git@host/org/repo or https://host/org/repo → host/org/repo
  s = s.replace(/^[a-z]+:\/\//, "");
  s = s.replace(/^git@/, "");
  s = s.replace(/^www\./, "");
  s = s.replace(/\.git$/, "");
  s = s.replace(/\/+$/, "");
  return s || null;
}
