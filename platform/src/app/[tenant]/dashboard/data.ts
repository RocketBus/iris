/**
 * Data loaders for the org dashboard.
 *
 * The page used to await every query before rendering anything, so the whole
 * screen waited on the slowest one. Now each panel under ./panels awaits only
 * the loaders it needs and streams in on its own.
 *
 * `cache()` dedupes per request: the eight panels that need `loadPayloads`
 * share a single round-trip instead of issuing eight identical queries.
 * Memoization is by argument identity, so every caller must pass the same
 * `(orgId, windowDays)` pair — which the page does, from the resolved window.
 */

import { cache } from "react";

import {
  getOrgUsageRollup,
  getRepoContributorCounts,
  computeAgentUsage,
} from "@/lib/queries/agent-usage";
import { computeOrgDORA } from "@/lib/queries/dora";
import {
  getOrgLatestPayloads,
  getOrgActiveContributors,
  computePreviousTotals,
  computePreviousPayloads,
} from "@/lib/queries/org-summary";
import {
  getOrgReposSummary,
  getOrgChangeDetections,
} from "@/lib/queries/temporal";
import { supabaseAdmin } from "@/lib/supabase";

/** Props every panel takes. Panels resolve their own data from these. */
export interface DashboardPanelProps {
  orgId: string;
  windowDays: number;
  tenantSlug: string;
}

export const loadRepoSummaries = cache((orgId: string, windowDays: number) =>
  getOrgReposSummary(supabaseAdmin, orgId, windowDays),
);

export const loadChanges = cache((orgId: string, windowDays: number) =>
  getOrgChangeDetections(supabaseAdmin, orgId, windowDays),
);

export const loadContributors = cache((orgId: string, windowDays: number) =>
  getOrgActiveContributors(supabaseAdmin, orgId, windowDays),
);

export const loadPayloads = cache(async (orgId: string, windowDays: number) => {
  const repos = await loadRepoSummaries(orgId, windowDays);
  return getOrgLatestPayloads(
    supabaseAdmin,
    orgId,
    repos.map((r) => r.id),
    windowDays,
  );
});

/**
 * Previous-period aggregates for delta calculation. Filtered by `window_days`
 * so multi-window tenants (issue #80) don't compute deltas across mismatched
 * analysis windows. `payload` is included so Delivery Quality / PR Health /
 * Cycle Time can compute their own previous-period aggregates the same way
 * they compute the current one — those metrics don't have dedicated summary
 * columns the way commits/PRs/AI-adoption do.
 *
 * This is the heaviest query on the page (JSONB payloads, ~15 rows per repo),
 * which is exactly why only the four panels that need it now wait on it.
 */
export const loadPreviousPeriod = cache(
  async (orgId: string, windowDays: number) => {
    const repos = await loadRepoSummaries(orgId, windowDays);

    const { data } = await supabaseAdmin
      .from("metrics")
      .select(
        "repository_id, commits_total, pr_merged_count, ai_detection_coverage_pct, payload",
      )
      .eq("organization_id", orgId)
      .eq("window_days", windowDays)
      .order("created_at", { ascending: false })
      .limit(repos.length * 15);

    const rows = data ?? [];
    return {
      totals: computePreviousTotals(repos, rows),
      payloads: computePreviousPayloads(repos, rows),
    };
  },
);

export const loadDORA = cache(async (orgId: string, windowDays: number) => {
  const payloads = await loadPayloads(orgId, windowDays);
  return computeOrgDORA(supabaseAdmin, orgId, { windowDays, payloads });
});

/**
 * AI-agent usage (#69): repo-grain usage over the same lookback window, with
 * k-anonymity suppression and the usage×durability cross-reference.
 */
export const loadAgentUsage = cache(
  async (orgId: string, windowDays: number) => {
    const usageSince = new Date(Date.now() - windowDays * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const [usageRows, contributorCounts, repos, payloads] = await Promise.all([
      getOrgUsageRollup(supabaseAdmin, orgId, usageSince),
      getRepoContributorCounts(supabaseAdmin, orgId, windowDays),
      loadRepoSummaries(orgId, windowDays),
      loadPayloads(orgId, windowDays),
    ]);

    return computeAgentUsage(usageRows, repos, payloads, contributorCounts);
  },
);
