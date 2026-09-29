import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Logs a Supabase query error without changing the caller's control flow.
 *
 * Every dashboard query loader destructures `{ data }` and falls back to an
 * empty result when `data` is null, which is the right behavior for "no
 * rows yet" — but it also silently swallows real failures (timeouts, RLS
 * misconfig, connection blips): a transient error renders identically to
 * "no data", with nothing in the logs to tell them apart. This makes that
 * failure visible in server logs while keeping the existing graceful
 * degradation.
 */
export function logQueryError(
  context: string,
  error: PostgrestError | null,
): void {
  if (error) console.error(`[iris] ${context} failed:`, error.message);
}
