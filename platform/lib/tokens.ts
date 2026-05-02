import { supabaseAdmin } from "@/lib/supabase";

const TOKEN_PREFIX = "iris_";

/**
 * Generate a random API token with prefix.
 * Returns { raw, hash, prefix } — raw is shown once, hash is stored.
 */
export async function generateToken(): Promise<{
  raw: string;
  hash: string;
  prefix: string;
}> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw =
    TOKEN_PREFIX +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  const hash = await hashToken(raw);
  const prefix = raw.slice(0, 12) + "...";

  return { raw, hash, prefix };
}

/**
 * Hash a token using SHA-256.
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validate a Bearer token and return the associated organization_id.
 * Returns null if token is invalid or revoked.
 */
export async function validateToken(
  token: string
): Promise<{ organization_id: string; token_id: string } | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const hash = await hashToken(token);
  const { data, error } = await supabaseAdmin
    .from("api_tokens")
    .select("id, organization_id")
    .eq("token_hash", hash)
    .is("revoked_at", null)
    .single();

  if (error || !data) return null;

  // Update last_used_at (fire-and-forget)
  void supabaseAdmin
    .from("api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return { organization_id: data.organization_id, token_id: data.id };
}
