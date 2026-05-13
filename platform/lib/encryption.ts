/**
 * Credential encryption helpers for org_integrations.
 *
 * Uses Postgres pgcrypto pgp_sym_encrypt/pgp_sym_decrypt with a master key
 * stored in INTEGRATIONS_ENCRYPTION_KEY. The key is read here, but every
 * encrypt/decrypt call goes through Supabase so the bytes-on-wire never
 * contain plaintext keys outside the request path.
 *
 * Generate the master key with: `openssl rand -base64 32`.
 *
 * The functions return base64 strings for transport convenience; the
 * column itself stores BYTEA so callers writing back to the table should
 * convert via the bytea hex form or pass through pgp_sym_encrypt directly.
 */

import { supabaseAdmin } from "@/lib/supabase";

function getMasterKey(): string {
  const key = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "INTEGRATIONS_ENCRYPTION_KEY is not configured. Set it in the environment to enable integrations.",
    );
  }
  return key;
}

/**
 * Encrypt a JSON-serializable payload and return a base64 string of the
 * pgp_sym_encrypt output. The result is a BYTEA when stored back in
 * Postgres — use `decode(<value>, 'base64')` in SQL or pass the base64
 * string through a parameterized BYTEA column.
 */
export async function encryptCredentials(payload: object): Promise<string> {
  const key = getMasterKey();
  const plaintext = JSON.stringify(payload);

  const { data, error } = await supabaseAdmin.rpc("encrypt_credentials", {
    plaintext,
    master_key: key,
  });

  if (error || typeof data !== "string") {
    throw new Error(
      `Failed to encrypt credentials: ${error?.message ?? "unknown error"}`,
    );
  }

  return data;
}

/**
 * Decrypt a base64 string produced by `encryptCredentials` back to its
 * original object payload. Throws if the master key has changed or the
 * payload is corrupted.
 */
export async function decryptCredentials<T = Record<string, string>>(
  encrypted: string,
): Promise<T> {
  const key = getMasterKey();

  const { data, error } = await supabaseAdmin.rpc("decrypt_credentials", {
    encrypted,
    master_key: key,
  });

  if (error || typeof data !== "string") {
    throw new Error(
      `Failed to decrypt credentials: ${error?.message ?? "unknown error"}`,
    );
  }

  try {
    return JSON.parse(data) as T;
  } catch {
    throw new Error("Decrypted credentials payload is not valid JSON");
  }
}

/**
 * Mask a secret for display in the UI. Keeps the first 4 and last 4 chars
 * so the user can tell different keys apart without leaking the body.
 */
export function maskSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 10) return "****";
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}
