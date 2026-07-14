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

/**
 * Look up an EXISTING repository for this org by bare name. Returns its id, or
 * null when the org has no such repo.
 *
 * Deliberately never creates rows. A repository belongs to an org only once
 * durability metrics have been pushed for it (via /api/ingest); usage is
 * enrichment that attaches to an already-onboarded repo. If usage could
 * materialize repositories, a machine-global usage spool flushed under one
 * org's token would leak every personal repo the developer ran the agent in
 * into that org's repo list — each showing "0 runs" because it has usage but no
 * analysis run. Unknown repos are skipped by the caller instead.
 *
 * Misses are cached (value null) so an unknown repo in a large batch is looked
 * up once, not once per record.
 */
async function resolveExistingRepositoryId(
  organizationId: string,
  repoName: string,
  cache: Map<string, string | null>,
): Promise<string | null> {
  if (cache.has(repoName)) return cache.get(repoName) ?? null;

  const { data: existing } = await supabaseAdmin
    .from("repositories")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", repoName)
    .single();

  const id: string | null = existing?.id ?? null;
  cache.set(repoName, id);
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
      // Usage only enriches repos the org already tracks; usage for any other
      // repo (e.g. a developer's personal repo picked up by the machine-global
      // spool) is dropped here at the org boundary.
      const repoCache = new Map<string, string | null>();
      let applied = 0;
      let duplicates = 0;
      let skipped = 0;

      for (const record of parsed.data.records) {
        const repoId = await resolveExistingRepositoryId(
          tokenData.organization_id,
          bareRepoName(record.repo),
          repoCache,
        );
        if (!repoId) {
          skipped += 1;
          continue;
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

      // Distinct repos that actually matched (cache holds null for misses).
      const matchedRepos = [...repoCache.values()].filter(Boolean).length;

      parentSpan.setAttributes({
        "iris.usage.applied": applied,
        "iris.usage.duplicates": duplicates,
        "iris.usage.skipped": skipped,
        "iris.usage.repositories": matchedRepos,
      });

      return Response.json(
        { applied, duplicates, skipped, repositories: matchedRepos },
        { status: 200 },
      );
    },
  ); // end withSpan
}
