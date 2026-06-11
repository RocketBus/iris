import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabase";
import { withSpan, recordError } from "@/lib/telemetry";
import { validateToken } from "@/lib/tokens";
import { USAGE_SCHEMA } from "@/types/usage";

// Anonymous aggregates are small; a generous flush batch still fits well under this.
export const maxDuration = 60;

/**
 * One anonymous usage record. `.strict()` is load-bearing: any field not on
 * this allow-list — including any identity field — fails validation. That is
 * the defense-in-depth the issue requires, enforced by the schema itself.
 */
const usageRecordSchema = z
  .object({
    schema: z.literal(USAGE_SCHEMA).optional(),
    agent: z.string().min(1).max(64),
    repo: z.string().min(1).max(255),
    period: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "period must be YYYY-MM-DD"),
    model: z.string().min(1).max(128),
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cache_read_input_tokens: z.number().int().nonnegative(),
    cache_creation_input_tokens: z.number().int().nonnegative(),
    tool_calls: z.number().int().nonnegative(),
    sidechain_tool_calls: z.number().int().nonnegative(),
    sessions: z.number().int().positive(),
    duration_bucket: z.string().min(1).max(32),
    idempotency_key: z.string().max(128),
  })
  .strict();

const usageIngestSchema = z.object({
  records: z.array(usageRecordSchema).min(1).max(1000),
});

// Explicit identity denylist — redundant with `.strict()` above, kept as a
// second layer so a known identity field produces a clear, specific rejection.
const FORBIDDEN_KEYS = new Set([
  "user",
  "username",
  "email",
  "host",
  "hostname",
  "ip",
  "cwd",
  "path",
  "file",
  "files",
  "branch",
  "gitbranch",
  "git_branch",
  "session_id",
  "sessionid",
  "author",
  "prompt",
  "transcript",
  "content",
]);

/** Returns the first identity-bearing key found in any record, or null. */
function findIdentityKey(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const records = (body as { records?: unknown }).records;
  if (!Array.isArray(records)) return null;
  for (const record of records) {
    if (typeof record !== "object" || record === null) continue;
    for (const key of Object.keys(record)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) return key;
    }
  }
  return null;
}

/** Bare repo name so usage lands on the same `repositories` row as durability
 * metrics (which are keyed by bare name within an org). "owner/repo" → "repo". */
function bareRepoName(repo: string): string {
  const parts = repo.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : repo;
}

async function resolveRepositoryId(
  organizationId: string,
  repoName: string,
  cache: Map<string, string>,
): Promise<string | null> {
  const cached = cache.get(repoName);
  if (cached) return cached;

  const { data: existing } = await supabaseAdmin
    .from("repositories")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", repoName)
    .single();

  let id: string | null = null;
  if (existing) {
    id = existing.id;
  } else {
    const { data: created, error } = await supabaseAdmin
      .from("repositories")
      .insert({ organization_id: organizationId, name: repoName })
      .select("id")
      .single();
    if (error || !created) return null;
    id = created.id;
  }

  if (id) cache.set(repoName, id);
  return id;
}

export async function POST(request: Request) {
  return withSpan(
    "ingest_usage",
    { "http.method": "POST", "http.route": "/api/ingest/usage" },
    async (parentSpan) => {
      // 1. Validate token
      const authHeader = request.headers.get("authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return Response.json(
          { error: "Missing or invalid Authorization header" },
          { status: 401 },
        );
      }
      const tokenData = await validateToken(authHeader.slice(7));
      if (!tokenData) {
        return Response.json(
          { error: "Invalid or revoked token" },
          { status: 401 },
        );
      }

      // 2. Parse body
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
      }

      // 3. Defense in depth: reject any identity field before validating shape.
      const identityKey = findIdentityKey(body);
      if (identityKey) {
        return Response.json(
          {
            error: "Identity field not permitted in usage payload",
            field: identityKey,
          },
          { status: 400 },
        );
      }

      // 4. Validate shape (.strict() rejects any unknown field too)
      const parsed = usageIngestSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          { error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 },
        );
      }

      // 5. Resolve repos + apply each record via the additive upsert RPC.
      const repoCache = new Map<string, string>();
      let applied = 0;
      let duplicates = 0;

      for (const record of parsed.data.records) {
        const repoId = await resolveRepositoryId(
          tokenData.organization_id,
          bareRepoName(record.repo),
          repoCache,
        );
        if (!repoId) {
          return Response.json(
            { error: "Failed to resolve repository", repo: record.repo },
            { status: 500 },
          );
        }

        const { data: wasApplied, error } = await supabaseAdmin.rpc(
          "ingest_usage_rollup",
          {
            p_org: tokenData.organization_id,
            p_repo: repoId,
            p_period: record.period,
            p_agent: record.agent,
            p_model: record.model,
            p_dedup_key: record.idempotency_key,
            p_sessions: record.sessions,
            p_input_tokens: record.input_tokens,
            p_output_tokens: record.output_tokens,
            p_cache_read_tokens: record.cache_read_input_tokens,
            p_cache_creation_tokens: record.cache_creation_input_tokens,
            p_tool_calls: record.tool_calls,
            p_sidechain_tool_calls: record.sidechain_tool_calls,
            p_duration_bucket: record.duration_bucket,
          },
        );

        if (error) {
          recordError(new Error(error.message));
          return Response.json(
            { error: "Failed to store usage", details: error.message },
            { status: 500 },
          );
        }

        if (wasApplied === false) duplicates += 1;
        else applied += 1;
      }

      parentSpan.setAttributes({
        "iris.usage.applied": applied,
        "iris.usage.duplicates": duplicates,
        "iris.usage.repositories": repoCache.size,
      });

      return Response.json(
        { applied, duplicates, repositories: repoCache.size },
        { status: 200 },
      );
    },
  ); // end withSpan
}
