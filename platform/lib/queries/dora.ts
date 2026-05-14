/**
 * DORA metric aggregation, sourced from the `external_*` tables.
 *
 * Why direct table queries instead of per-repo payload aggregation: the
 * CLI fetches DORA events org-wide (the endpoint isn't repo-scoped), so
 * every repo's payload carries the SAME slice of the universe under the
 * `dora_*` family. Summing across payloads in `computeDORA` was
 * multiplying the org counters by the number of repos that had pushed.
 *
 * Single source of truth: the events table. Org-wide and per-repo
 * queries differ only in whether they filter by `repository_id`.
 *
 * Engine-derived `cfr_by_origin` / `rollback_rate_by_origin` still come
 * from the payloads because they need the per-commit join against the
 * local origin classifier output — that can't be reconstructed server-side
 * without replaying the analysis.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ReportMetrics } from "@/types/metrics";
import type { OrgDORA, RepoDORA } from "@/types/org-summary";

const PROVIDER = "datadog" as const;
const COMMIT_CHUNK_SIZE = 100;
const DEFAULT_WINDOW_DAYS = 30;

const ORIGINS = ["HUMAN", "AI_ASSISTED", "BOT"] as const;
type Origin = (typeof ORIGINS)[number];

interface DeploymentRow {
  id: string;
  change_failure: boolean | null;
  recovery_time_sec: number | null;
  remediation_type: string | null;
  started_at: string;
}

interface CommitRow {
  change_lead_time: number | null;
}

export interface ComputeOrgDORAOptions {
  windowDays?: number;
  /**
   * Latest payloads keyed by repo. Used to surface the engine-derived
   * `cfr_by_origin` / `rollback_rate_by_origin` (which can't be
   * computed server-side without replaying origin classification).
   * When omitted, those fields come back empty.
   */
  payloads?: Map<string, ReportMetrics>;
}

export async function computeOrgDORA(
  supabase: SupabaseClient,
  organizationId: string,
  opts: ComputeOrgDORAOptions = {},
): Promise<OrgDORA | null> {
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const windowFrom = isoDaysAgo(windowDays);

  const integrationActive = await hasActiveIntegration(
    supabase,
    organizationId,
  );
  if (!integrationActive) return null;

  const { deployments, commits } = await fetchDeploymentsAndCommits(
    supabase,
    organizationId,
    windowFrom,
  );

  const { data: incidents, error: incErr } = await supabase
    .from("external_incidents")
    .select("time_to_restore_seconds")
    .eq("organization_id", organizationId)
    .eq("provider", PROVIDER)
    .gte("started_at", windowFrom);
  if (incErr) throw new Error(`load incidents: ${incErr.message}`);

  if (deployments.length === 0 && (incidents?.length ?? 0) === 0) return null;

  const ttrs = (incidents ?? [])
    .map((i) => i.time_to_restore_seconds)
    .filter((v): v is number => v !== null);

  const deployMetrics = deployDerivedMetrics(deployments, commits, windowDays);
  const { cfrByOrigin, rollbackRateByOrigin } =
    aggregateCfrByOriginFromPayloads(opts.payloads);

  const reposWithData = opts.payloads
    ? [...opts.payloads.values()].filter((p) => p.dora_source === "datadog")
        .length
    : 0;

  return {
    reposWithData,
    deploymentsTotal: deployMetrics.deploymentsTotal,
    deploymentsFailed: deployMetrics.deploymentsFailed,
    deploymentsPendingEvaluation: deployMetrics.deploymentsPendingEvaluation,
    incidentsTotal: incidents?.length ?? 0,
    cfr: deployMetrics.cfr,
    rollbacksTotal: deployMetrics.rollbacksTotal,
    rollbackRate: deployMetrics.rollbackRate,
    mttrPerDeploySecondsMedian: deployMetrics.mttrPerDeploySecondsMedian,
    mttrPerIncidentSecondsMedian: median(ttrs),
    leadTimeSecondsMedian: deployMetrics.leadTimeSecondsMedian,
    deployFrequencyPerDay: deployMetrics.deployFrequencyPerDay,
    cfrByOrigin,
    rollbackRateByOrigin,
  };
}

export async function computeRepoDORA(
  supabase: SupabaseClient,
  organizationId: string,
  repositoryId: string,
  opts: { windowDays?: number } = {},
): Promise<RepoDORA | null> {
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const windowFrom = isoDaysAgo(windowDays);

  const { deployments, commits } = await fetchDeploymentsAndCommits(
    supabase,
    organizationId,
    windowFrom,
    repositoryId,
  );

  if (deployments.length === 0) return null;

  const m = deployDerivedMetrics(deployments, commits, windowDays);
  return {
    windowDays,
    deploymentsTotal: m.deploymentsTotal,
    deploymentsFailed: m.deploymentsFailed,
    deploymentsPendingEvaluation: m.deploymentsPendingEvaluation,
    cfr: m.cfr,
    mttrPerDeploySecondsMedian: m.mttrPerDeploySecondsMedian,
    rollbacksTotal: m.rollbacksTotal,
    rollbackRate: m.rollbackRate,
    leadTimeSecondsMedian: m.leadTimeSecondsMedian,
    deployFrequencyPerDay: m.deployFrequencyPerDay,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function hasActiveIntegration(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("org_integrations")
    .select("status")
    .eq("organization_id", organizationId)
    .eq("provider", PROVIDER)
    .maybeSingle();
  if (error) throw new Error(`load integration: ${error.message}`);
  return !!data && data.status !== "disconnected";
}

async function fetchDeploymentsAndCommits(
  supabase: SupabaseClient,
  organizationId: string,
  windowFromIso: string,
  repositoryId?: string,
): Promise<{ deployments: DeploymentRow[]; commits: CommitRow[] }> {
  let q = supabase
    .from("external_deployments")
    .select(
      "id, change_failure, recovery_time_sec, remediation_type, started_at",
    )
    .eq("organization_id", organizationId)
    .eq("provider", PROVIDER)
    .gte("started_at", windowFromIso);
  if (repositoryId !== undefined) {
    q = q.eq("repository_id", repositoryId);
  }

  const { data: deployments, error } = await q;
  if (error) throw new Error(`load deployments: ${error.message}`);
  const deploys = (deployments ?? []) as DeploymentRow[];

  const ids = deploys.map((d) => d.id);
  const commits: CommitRow[] = [];
  for (let i = 0; i < ids.length; i += COMMIT_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + COMMIT_CHUNK_SIZE);
    const { data, error: cErr } = await supabase
      .from("external_deployment_commits")
      .select("change_lead_time")
      .in("deployment_id", chunk);
    if (cErr) throw new Error(`load deployment commits: ${cErr.message}`);
    if (data) commits.push(...(data as CommitRow[]));
  }

  return { deployments: deploys, commits };
}

function deployDerivedMetrics(
  deployments: DeploymentRow[],
  commits: CommitRow[],
  windowDays: number,
) {
  const evaluated = deployments.filter((d) => d.change_failure !== null);
  const failed = deployments.filter((d) => d.change_failure === true);
  const pending = deployments.filter((d) => d.change_failure === null);
  const rollbacks = failed.filter((d) => d.remediation_type === "rollback");

  const recoveryTimes = failed
    .map((d) => d.recovery_time_sec)
    .filter((v): v is number => v !== null);
  const leadTimes = commits
    .map((c) => c.change_lead_time)
    .filter((v): v is number => v !== null);

  return {
    deploymentsTotal: deployments.length,
    deploymentsFailed: failed.length,
    deploymentsPendingEvaluation: pending.length,
    rollbacksTotal: rollbacks.length,
    cfr: evaluated.length > 0 ? failed.length / evaluated.length : null,
    rollbackRate: failed.length > 0 ? rollbacks.length / failed.length : null,
    mttrPerDeploySecondsMedian: median(recoveryTimes),
    leadTimeSecondsMedian: median(leadTimes),
    deployFrequencyPerDay:
      windowDays > 0 ? deployments.length / windowDays : null,
  };
}

function aggregateCfrByOriginFromPayloads(
  payloads: Map<string, ReportMetrics> | undefined,
): {
  cfrByOrigin: OrgDORA["cfrByOrigin"];
  rollbackRateByOrigin: OrgDORA["rollbackRateByOrigin"];
} {
  const failedByOrigin: Record<Origin, number> = {
    HUMAN: 0,
    AI_ASSISTED: 0,
    BOT: 0,
  };
  const evaluatedByOrigin: Record<Origin, number> = {
    HUMAN: 0,
    AI_ASSISTED: 0,
    BOT: 0,
  };
  const rollbacksByOrigin: Record<Origin, number> = {
    HUMAN: 0,
    AI_ASSISTED: 0,
    BOT: 0,
  };
  const failedByOriginForRollback: Record<Origin, number> = {
    HUMAN: 0,
    AI_ASSISTED: 0,
    BOT: 0,
  };

  if (payloads) {
    for (const p of payloads.values()) {
      if (p.dora_source !== "datadog") continue;
      for (const origin of ORIGINS) {
        const entry = p.dora_cfr_by_origin?.[origin];
        if (entry) {
          failedByOrigin[origin] += entry.failed;
          evaluatedByOrigin[origin] += entry.evaluated;
        }
        const rb = p.dora_rollback_rate_by_origin?.[origin];
        if (rb) {
          rollbacksByOrigin[origin] += rb.rollbacks;
          failedByOriginForRollback[origin] += rb.failed;
        }
      }
    }
  }

  return {
    cfrByOrigin: ORIGINS.flatMap((origin) => {
      const evaluated = evaluatedByOrigin[origin];
      const failed = failedByOrigin[origin];
      if (evaluated === 0) return [];
      return [{ origin, failed, evaluated, cfr: failed / evaluated }];
    }),
    rollbackRateByOrigin: ORIGINS.flatMap((origin) => {
      const failed = failedByOriginForRollback[origin];
      const rollbacks = rollbacksByOrigin[origin];
      if (failed === 0) return [];
      return [{ origin, rollbacks, failed, rollbackRate: rollbacks / failed }];
    }),
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export const __testing = {
  deployDerivedMetrics,
  aggregateCfrByOriginFromPayloads,
  median,
};
