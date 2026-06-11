/**
 * AI-agent usage queries for the dashboard (#69).
 *
 * Reads the anonymous `usage_rollup` table (#68) and exposes it at repo grain,
 * with k-anonymity suppression and a cross-reference against the engine's
 * durability signals.
 *
 * --- Privacy model ---------------------------------------------------------
 * `usage_rollup` already has no person dimension; the smallest grain is
 * (org, repo, day, agent, model). We suppress by *repo contributor count*: a
 * repo's usage is shown individually only when at least `k` distinct people
 * contributed to it (from the engine's `active_users`, COUNTED — never named).
 * Repos below `k` fold into an "Others" aggregate so the numbers aren't lost,
 * only de-attributed.
 *
 * The platform has no team/org-chart model, so "team size" from the issue is
 * realized as repo contributor count — the faithful k-anonymity proxy that the
 * existing data supports.
 *
 * RESIDUAL HOLE (documented per the issue): a repo with >= k contributors where
 * only one person actually uses an AI agent is NOT individually protected — its
 * usage is real but we cannot know *who* produced it without per-person
 * telemetry, which we deliberately never collect. Mitigation: usage is never
 * attributed to a person in any query or screen, small repos are suppressed,
 * and a rotating distinct-contributor pseudonym (epic follow-up) can tighten
 * this later if inference ever becomes a real problem.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_WINDOW_DAYS } from "@/lib/queries/temporal";
import type { ReportMetrics } from "@/types/metrics";
import type { RepoSummary } from "@/types/temporal";
import type {
  AgentUsageRow,
  AgentUsageSection,
  UsageRollupRow,
} from "@/types/usage";

/** Default k-anonymity threshold: a repo needs this many contributors to show. */
export const DEFAULT_K_ANONYMITY = 4;

/** Raw `usage_rollup` rows for an org since (and including) `sinceDay`. */
export async function getOrgUsageRollup(
  supabase: SupabaseClient,
  organizationId: string,
  sinceDay: string,
): Promise<UsageRollupRow[]> {
  const { data } = await supabase
    .from("usage_rollup")
    .select(
      "repository_id, period_day, agent, model, sessions, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, tool_calls, sidechain_tool_calls, duration_buckets",
    )
    .eq("organization_id", organizationId)
    .gte("period_day", sinceDay)
    .limit(5000);

  return (data ?? []) as UsageRollupRow[];
}

/**
 * Distinct contributor COUNT per repo, from the latest analysis run's
 * `active_users`. Names are reduced to a count here and never surface.
 */
export async function getRepoContributorCounts(
  supabase: SupabaseClient,
  organizationId: string,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<Map<string, number>> {
  const { data } = await supabase
    .from("analysis_runs")
    .select("repository_id, active_users, created_at")
    .eq("organization_id", organizationId)
    .eq("window_days", windowDays)
    .order("created_at", { ascending: false })
    .limit(500);

  const seen = new Set<string>();
  const counts = new Map<string, number>();

  for (const row of data ?? []) {
    if (seen.has(row.repository_id)) continue; // latest run per repo only
    seen.add(row.repository_id);

    const users = (row.active_users ?? []) as Array<string | { name?: string }>;
    const distinct = new Set<string>();
    for (const u of users) {
      const name = typeof u === "string" ? u : u?.name;
      if (name) distinct.add(name.toLowerCase());
    }
    counts.set(row.repository_id, distinct.size);
  }

  return counts;
}

interface RepoAcc {
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  toolCalls: number;
  perModelOutput: Map<string, number>;
  durationBuckets: Record<string, number>;
}

function emptyAcc(): RepoAcc {
  return {
    sessions: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    toolCalls: 0,
    perModelOutput: new Map(),
    durationBuckets: {},
  };
}

function addRow(acc: RepoAcc, row: UsageRollupRow): void {
  acc.sessions += row.sessions;
  acc.inputTokens += row.input_tokens;
  acc.outputTokens += row.output_tokens;
  acc.cacheReadTokens += row.cache_read_tokens;
  acc.cacheCreationTokens += row.cache_creation_tokens;
  acc.toolCalls += row.tool_calls;
  acc.perModelOutput.set(
    row.model,
    (acc.perModelOutput.get(row.model) ?? 0) + row.output_tokens,
  );
  for (const [bucket, count] of Object.entries(row.duration_buckets ?? {})) {
    acc.durationBuckets[bucket] = (acc.durationBuckets[bucket] ?? 0) + count;
  }
}

function mergeAcc(into: RepoAcc, from: RepoAcc): void {
  into.sessions += from.sessions;
  into.inputTokens += from.inputTokens;
  into.outputTokens += from.outputTokens;
  into.cacheReadTokens += from.cacheReadTokens;
  into.cacheCreationTokens += from.cacheCreationTokens;
  into.toolCalls += from.toolCalls;
  for (const [model, out] of from.perModelOutput) {
    into.perModelOutput.set(model, (into.perModelOutput.get(model) ?? 0) + out);
  }
  for (const [bucket, count] of Object.entries(from.durationBuckets)) {
    into.durationBuckets[bucket] = (into.durationBuckets[bucket] ?? 0) + count;
  }
}

function topModel(acc: RepoAcc): string | null {
  let best: string | null = null;
  let bestOut = -1;
  for (const [model, out] of acc.perModelOutput) {
    if (out > bestOut) {
      best = model;
      bestOut = out;
    }
  }
  return best;
}

function aiDurability(payload: ReportMetrics | undefined): number | null {
  const byOrigin = (
    payload as
      | { durability_by_origin?: Record<string, { survival_rate?: number }> }
      | undefined
  )?.durability_by_origin;
  return byOrigin?.AI_ASSISTED?.survival_rate ?? null;
}

/**
 * Aggregate usage to repo grain, suppress repos below `k` contributors into an
 * "Others" row, and attach the durability cross-reference. Pure — all data is
 * passed in. Returns null when there's no usage to show.
 */
export function computeAgentUsage(
  usageRows: UsageRollupRow[],
  repoSummaries: RepoSummary[],
  payloads: Map<string, ReportMetrics>,
  contributorCounts: Map<string, number>,
  k: number = DEFAULT_K_ANONYMITY,
): AgentUsageSection | null {
  if (usageRows.length === 0) return null;

  const nameById = new Map(repoSummaries.map((r) => [r.id, r.name]));
  const stabById = new Map(
    repoSummaries.map((r) => [r.id, r.stabilization_ratio]),
  );

  const byRepo = new Map<string, RepoAcc>();
  for (const row of usageRows) {
    const acc = byRepo.get(row.repository_id) ?? emptyAcc();
    addRow(acc, row);
    byRepo.set(row.repository_id, acc);
  }

  const visible: AgentUsageRow[] = [];
  const suppressed = emptyAcc();
  let suppressedCount = 0;

  for (const [repoId, acc] of byRepo) {
    // Unknown contributor count (no analysis run yet) is treated as below the
    // threshold — never show a repo individually unless we can confirm >= k.
    const contributors = contributorCounts.get(repoId) ?? 0;

    if (contributors >= k) {
      visible.push({
        repo: nameById.get(repoId) ?? repoId,
        contributors,
        suppressed: false,
        repoCount: 1,
        sessions: acc.sessions,
        inputTokens: acc.inputTokens,
        outputTokens: acc.outputTokens,
        cacheReadTokens: acc.cacheReadTokens,
        cacheCreationTokens: acc.cacheCreationTokens,
        toolCalls: acc.toolCalls,
        topModel: topModel(acc),
        durationBuckets: acc.durationBuckets,
        stabilization: stabById.get(repoId) ?? null,
        durabilityAi: aiDurability(payloads.get(repoId)),
      });
    } else {
      mergeAcc(suppressed, acc);
      suppressedCount += 1;
    }
  }

  visible.sort((a, b) => b.outputTokens - a.outputTokens);

  const suppressedRow: AgentUsageRow | null =
    suppressedCount > 0
      ? {
          repo: null,
          contributors: 0,
          suppressed: true,
          repoCount: suppressedCount,
          sessions: suppressed.sessions,
          inputTokens: suppressed.inputTokens,
          outputTokens: suppressed.outputTokens,
          cacheReadTokens: suppressed.cacheReadTokens,
          cacheCreationTokens: suppressed.cacheCreationTokens,
          toolCalls: suppressed.toolCalls,
          topModel: topModel(suppressed),
          durationBuckets: suppressed.durationBuckets,
          // A mix of repos — no single durability number is meaningful.
          stabilization: null,
          durabilityAi: null,
        }
      : null;

  const all = suppressedRow ? [...visible, suppressedRow] : visible;
  const totals = {
    sessions: all.reduce((s, r) => s + r.sessions, 0),
    inputTokens: all.reduce((s, r) => s + r.inputTokens, 0),
    outputTokens: all.reduce((s, r) => s + r.outputTokens, 0),
    toolCalls: all.reduce((s, r) => s + r.toolCalls, 0),
  };

  return {
    rows: visible,
    suppressedRow,
    totals,
    kThreshold: k,
    suppressedRepoCount: suppressedCount,
  };
}
