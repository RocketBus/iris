/**
 * Datadog daily sync.
 *
 * Pulls DORA deployment and failure events into `external_deployments`
 * (+ `external_deployment_commits`) and `external_incidents`. Idempotent
 * by `(provider, provider_event_id)` so repeat runs are safe.
 *
 * Pagination uses the time-slicing strategy documented in §9.5 of
 * docs/PLAN-datadog.md — there is no cursor mechanism on the DORA v2
 * list endpoints.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  listDeployments,
  listFailures,
  normalizeSite,
  toDatadogTimestamp,
  type DatadogCredentials,
  type DatadogSite,
  type DoraDeployment,
  type DoraFailure,
} from "./client";

import { logger } from "@/lib/debug";
import { decryptCredentials } from "@/lib/encryption";

const DEFAULT_BACKFILL_DAYS = 30;
const PAGE_LIMIT = 100;
const MAX_PAGES_PER_ENDPOINT = 200;
const PROVIDER = "datadog" as const;

export interface SyncOptions {
  /** Override the backfill window for a first sync. Defaults to 30 days. */
  backfillDays?: number;
  /** Inject a clock for testing. Defaults to `Date.now()`. */
  now?: () => Date;
}

export interface SyncResult {
  organizationId: string;
  deploymentsUpserted: number;
  commitsUpserted: number;
  failuresUpserted: number;
  /** Deployments persisted where DD's repository_id didn't resolve to a tracked Iris repo. */
  unmatchedDeployments: number;
  /** ISO 8601 window the sync covered. */
  from: string;
  to: string;
}

interface RepoLookup {
  /** Normalized slug → repositories.id */
  byNormalizedSlug: Map<string, string>;
}

/**
 * Sync a single org's Datadog integration. Updates `last_sync_at` on
 * success and `last_error` on failure; never throws — callers (cron
 * route) inspect the returned result or query the table afterward.
 */
export async function syncOrganization(
  supabase: SupabaseClient,
  organizationId: string,
  opts: SyncOptions = {},
): Promise<SyncResult | { organizationId: string; error: string }> {
  const now = (opts.now ?? (() => new Date()))();
  const backfillDays = opts.backfillDays ?? DEFAULT_BACKFILL_DAYS;

  try {
    const { data: integration, error: loadErr } = await supabase
      .from("org_integrations")
      .select("id, credentials_encrypted, last_sync_at, status, config")
      .eq("organization_id", organizationId)
      .eq("provider", PROVIDER)
      .maybeSingle();

    if (loadErr) throw new Error(`load integration: ${loadErr.message}`);
    if (!integration) throw new Error("integration row not found");
    if (integration.status === "disconnected") {
      throw new Error("integration is disconnected");
    }
    if (!integration.credentials_encrypted) {
      throw new Error("integration has no credentials (disconnected?)");
    }

    const credsPayload = await decryptCredentials<{
      apiKey: string;
      appKey: string;
      site: string;
    }>(integration.credentials_encrypted);

    const creds: DatadogCredentials = {
      apiKey: credsPayload.apiKey,
      appKey: credsPayload.appKey,
      site: normalizeSite(credsPayload.site) as DatadogSite,
    };

    const repoLookup = await loadRepoLookup(supabase, organizationId);

    const fromDate = integration.last_sync_at
      ? new Date(integration.last_sync_at)
      : new Date(now.getTime() - backfillDays * 24 * 60 * 60 * 1000);
    const from = toDatadogTimestamp(fromDate);
    const to = toDatadogTimestamp(now);

    const deployments = await fetchAllDeployments(creds, from, to);
    const failures = await fetchAllFailures(creds, from, to);

    const { deploymentsUpserted, commitsUpserted, unmatchedDeployments } =
      await persistDeployments(
        supabase,
        organizationId,
        deployments,
        repoLookup,
      );
    const failuresUpserted = await persistFailures(
      supabase,
      organizationId,
      failures,
    );

    await supabase
      .from("org_integrations")
      .update({
        last_sync_at: now.toISOString(),
        last_error: null,
        status: "active",
      })
      .eq("organization_id", organizationId)
      .eq("provider", PROVIDER);

    return {
      organizationId,
      deploymentsUpserted,
      commitsUpserted,
      failuresUpserted,
      unmatchedDeployments,
      from,
      to,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("datadog sync failed", { organizationId, error: message });
    await supabase
      .from("org_integrations")
      .update({
        last_error: truncate(message, 1000),
        status: "error",
      })
      .eq("organization_id", organizationId)
      .eq("provider", PROVIDER);
    return { organizationId, error: message };
  }
}

/**
 * Backfill `repository_id` on existing `external_deployments` rows
 * that were ingested before their repo was registered in Iris (or
 * before `repositories.remote_url` was populated). The sync routine
 * only matches at insertion time; without this step, rows persist with
 * `repository_id = null` and the per-repo DORA view stays empty.
 *
 * Idempotent: never overwrites an already-set `repository_id`; only
 * affects rows where the match exists *right now*.
 */
export async function rematchUnlinkedDeployments(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<{ matched: number; checked: number }> {
  const repoLookup = await loadRepoLookup(supabase, organizationId);
  if (repoLookup.byNormalizedSlug.size === 0) {
    return { matched: 0, checked: 0 };
  }

  const PAGE = 1000;
  const UPDATE_CHUNK = 100;
  let offset = 0;
  let matched = 0;
  let checked = 0;

  while (true) {
    const { data, error } = await supabase
      .from("external_deployments")
      .select("id, dd_repository_id")
      .eq("organization_id", organizationId)
      .eq("provider", PROVIDER)
      .is("repository_id", null)
      .not("dd_repository_id", "is", null)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`rematch list: ${error.message}`);
    if (!data || data.length === 0) break;

    checked += data.length;

    const updatesByRepoId = new Map<string, string[]>();
    for (const row of data) {
      const normalized = normalizeRepoSlug(row.dd_repository_id);
      if (!normalized) continue;
      const repoId = repoLookup.byNormalizedSlug.get(normalized);
      if (!repoId) continue;
      const bucket = updatesByRepoId.get(repoId) ?? [];
      bucket.push(row.id);
      updatesByRepoId.set(repoId, bucket);
    }

    for (const [repoId, depIds] of updatesByRepoId) {
      for (let i = 0; i < depIds.length; i += UPDATE_CHUNK) {
        const chunk = depIds.slice(i, i + UPDATE_CHUNK);
        const { error: upErr } = await supabase
          .from("external_deployments")
          .update({ repository_id: repoId })
          .in("id", chunk);
        if (upErr) throw new Error(`rematch update: ${upErr.message}`);
        matched += chunk.length;
      }
    }

    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return { matched, checked };
}

async function loadRepoLookup(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<RepoLookup> {
  const { data, error } = await supabase
    .from("repositories")
    .select("id, remote_url, name")
    .eq("organization_id", organizationId);

  if (error) throw new Error(`load repos: ${error.message}`);

  const byNormalizedSlug = new Map<string, string>();
  for (const row of data ?? []) {
    const slug = normalizeRepoSlug(row.remote_url);
    if (slug) byNormalizedSlug.set(slug, row.id);
  }
  return { byNormalizedSlug };
}

/**
 * Normalize a git remote URL or Datadog slug into "host/path" form
 * (lowercased, no scheme, no `.git`, no trailing slash). Returns `null`
 * for empty input.
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

/**
 * Return the first occurrence of each item keyed by `idFn`.
 *
 * §9.5 of the plan doc: DORA list endpoints have inclusive `to`
 * boundaries, so the last event of one page reappears as the first
 * event of the next. The UNIQUE constraint on `(provider,
 * provider_event_id)` catches that across separate statements, but
 * Postgres rejects duplicate conflict keys *within* a single upsert
 * with "ON CONFLICT DO UPDATE command cannot affect row a second
 * time". We dedupe in memory before the upsert.
 */
function uniqueByKey<T>(items: T[], keyFn: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function fetchAllDeployments(
  creds: DatadogCredentials,
  from: string,
  to: string,
): Promise<DoraDeployment[]> {
  const events: DoraDeployment[] = [];
  let toTs = to;
  for (let page = 0; page < MAX_PAGES_PER_ENDPOINT; page++) {
    const batch = await listDeployments(creds, {
      from,
      to: toTs,
      query: "*",
      limit: PAGE_LIMIT,
    });
    if (batch.length === 0) break;
    events.push(...batch);
    if (batch.length < PAGE_LIMIT) break;

    const nextTs = oldestStartedAt(batch, (e) => e.attributes.started_at);
    if (!nextTs || nextTs === toTs) {
      // §9.5 anti-spin guard: page is full and the boundary didn't move
      // (sub-second co-occurrence on every event). Step back 1 ms.
      toTs = toDatadogTimestamp(new Date(parseIso(toTs).getTime() - 1));
    } else {
      toTs = nextTs;
    }
  }
  return uniqueByKey(events, (e) => e.id);
}

async function fetchAllFailures(
  creds: DatadogCredentials,
  from: string,
  to: string,
): Promise<DoraFailure[]> {
  const events: DoraFailure[] = [];
  let toTs = to;
  for (let page = 0; page < MAX_PAGES_PER_ENDPOINT; page++) {
    const batch = await listFailures(creds, {
      from,
      to: toTs,
      query: "*",
      limit: PAGE_LIMIT,
    });
    if (batch.length === 0) break;
    events.push(...batch);
    if (batch.length < PAGE_LIMIT) break;

    const nextTs = oldestStartedAt(batch, (e) => e.attributes.started_at);
    if (!nextTs || nextTs === toTs) {
      toTs = toDatadogTimestamp(new Date(parseIso(toTs).getTime() - 1));
    } else {
      toTs = nextTs;
    }
  }
  return uniqueByKey(events, (e) => e.id);
}

function oldestStartedAt<T>(batch: T[], pick: (e: T) => string): string | null {
  let minMs = Infinity;
  for (const e of batch) {
    const ms = parseIso(pick(e)).getTime();
    if (ms < minMs) minMs = ms;
  }
  if (!isFinite(minMs)) return null;
  return toDatadogTimestamp(new Date(minMs));
}

function parseIso(iso: string): Date {
  return new Date(iso);
}

async function persistDeployments(
  supabase: SupabaseClient,
  organizationId: string,
  deployments: DoraDeployment[],
  repoLookup: RepoLookup,
): Promise<{
  deploymentsUpserted: number;
  commitsUpserted: number;
  unmatchedDeployments: number;
}> {
  if (deployments.length === 0) {
    return {
      deploymentsUpserted: 0,
      commitsUpserted: 0,
      unmatchedDeployments: 0,
    };
  }

  let unmatched = 0;
  const rows = deployments.map((event) => {
    const ddSlug = event.attributes.git?.repository_id ?? null;
    const repositoryId = matchRepo(ddSlug, repoLookup);
    if (ddSlug && !repositoryId) unmatched++;

    return {
      organization_id: organizationId,
      provider: PROVIDER,
      provider_event_id: event.id,
      repository_id: repositoryId,
      dd_repository_id: ddSlug,
      service: event.attributes.service ?? null,
      env: event.attributes.env ?? null,
      team: event.attributes.team ?? null,
      version: event.attributes.version ?? null,
      commit_sha: event.attributes.git?.commit_sha ?? null,
      change_failure:
        event.attributes.change_failure === undefined
          ? null
          : event.attributes.change_failure,
      deployment_type: event.attributes.deployment_type ?? null,
      source: event.attributes.source ?? null,
      started_at: event.attributes.started_at,
      finished_at: event.attributes.finished_at ?? null,
      duration_seconds: secondsFromDuration(event.attributes.duration),
      number_of_commits: event.attributes.number_of_commits ?? null,
      number_of_pull_requests: event.attributes.number_of_pull_requests ?? null,
      recovery_time_sec: event.attributes.recovery_time_sec ?? null,
      remediation_type: event.attributes.remediation?.type ?? null,
      remediation_id: event.attributes.remediation?.id ?? null,
      raw: event,
    };
  });

  const { data: upserted, error } = await supabase
    .from("external_deployments")
    .upsert(rows, { onConflict: "provider,provider_event_id" })
    .select("id, provider_event_id");

  if (error) throw new Error(`upsert deployments: ${error.message}`);
  if (!upserted) throw new Error("upsert deployments returned no rows");

  const idByEventId = new Map<string, string>();
  for (const row of upserted) {
    idByEventId.set(row.provider_event_id, row.id);
  }

  const commitsUpserted = await persistDeploymentCommits(
    supabase,
    deployments,
    idByEventId,
  );

  return {
    deploymentsUpserted: upserted.length,
    commitsUpserted,
    unmatchedDeployments: unmatched,
  };
}

async function persistDeploymentCommits(
  supabase: SupabaseClient,
  deployments: DoraDeployment[],
  idByEventId: Map<string, string>,
): Promise<number> {
  const commitRows: Array<{
    deployment_id: string;
    commit_sha: string;
    commit_timestamp: string | null;
    author_email: string | null;
    author_canonical_email: string | null;
    is_bot: boolean | null;
    change_lead_time: number | null;
    time_to_deploy: number | null;
  }> = [];

  for (const event of deployments) {
    const deploymentId = idByEventId.get(event.id);
    if (!deploymentId) continue;
    const commits = event.attributes.commits ?? [];
    for (const c of commits) {
      if (!c.sha) continue;
      commitRows.push({
        deployment_id: deploymentId,
        commit_sha: c.sha,
        commit_timestamp: normalizeNullableIso(c.timestamp),
        author_email: c.author?.email ?? null,
        author_canonical_email: c.author?.canonical_email ?? null,
        is_bot: c.author?.is_bot ?? null,
        change_lead_time: c.change_lead_time ?? null,
        time_to_deploy: c.time_to_deploy ?? null,
      });
    }
  }

  // Same Postgres constraint as the deployments upsert — dedupe the
  // composite (deployment_id, commit_sha) PK before sending. A single
  // deploy whose `attributes.commits[]` contains the same sha twice
  // would otherwise crash the whole sync.
  const dedupedCommitRows = uniqueByKey(
    commitRows,
    (r) => `${r.deployment_id}:${r.commit_sha}`,
  );

  if (dedupedCommitRows.length === 0) return 0;

  const { error } = await supabase
    .from("external_deployment_commits")
    .upsert(dedupedCommitRows, {
      onConflict: "deployment_id,commit_sha",
      ignoreDuplicates: false,
    });

  if (error) throw new Error(`upsert deployment commits: ${error.message}`);
  return dedupedCommitRows.length;
}

async function persistFailures(
  supabase: SupabaseClient,
  organizationId: string,
  failures: DoraFailure[],
): Promise<number> {
  if (failures.length === 0) return 0;

  const rows = failures.map((event) => ({
    organization_id: organizationId,
    provider: PROVIDER,
    provider_event_id: event.id,
    service: event.attributes.service ?? null,
    env: event.attributes.env ?? null,
    team: event.attributes.team ?? null,
    name: event.attributes.name ?? null,
    severity: event.attributes.severity ?? null,
    started_at: event.attributes.started_at,
    finished_at: event.attributes.finished_at ?? null,
    time_to_restore_seconds: event.attributes.time_to_restore ?? null,
    source: event.attributes.source ?? null,
    raw: event,
  }));

  const { data, error } = await supabase
    .from("external_incidents")
    .upsert(rows, { onConflict: "provider,provider_event_id" })
    .select("id");

  if (error) throw new Error(`upsert failures: ${error.message}`);
  return data?.length ?? 0;
}

function matchRepo(slug: string | null, lookup: RepoLookup): string | null {
  const normalized = normalizeRepoSlug(slug);
  if (!normalized) return null;
  return lookup.byNormalizedSlug.get(normalized) ?? null;
}

function secondsFromDuration(duration: number | undefined): number | null {
  if (typeof duration !== "number" || !Number.isFinite(duration)) return null;
  // Datadog returns duration in nanoseconds for some endpoints; the DORA
  // event payload reports seconds in the probed responses. Treat as
  // seconds and clamp to an int.
  return Math.round(duration);
}

function normalizeNullableIso(iso: string | undefined): string | null {
  if (!iso) return null;
  // Datadog occasionally returns the zero value "0001-01-01T00:00:00Z"
  // on fields it doesn't have data for (observed in pull_requests[]);
  // treat anything before 2000 as missing.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2000) return null;
  return d.toISOString();
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

export const __testing = {
  normalizeRepoSlug,
  oldestStartedAt,
  normalizeNullableIso,
  uniqueByKey,
};
