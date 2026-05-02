/**
 * Temporal queries — trends, comparisons, change detection.
 * Pure functions that take a Supabase client and return typed data.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  TimeSeriesPoint,
  AIImpactPoint,
  RepoSummary,
  ChangeDetection,
} from "@/types/temporal";
import { classifyHealth } from "@/types/temporal";

const SPARKLINE_POINTS = 12;

/** Get time series for a repo (all analysis runs, ascending). */
export async function getRepoTimeSeries(
  supabase: SupabaseClient,
  repositoryId: string,
  limit = 52,
): Promise<TimeSeriesPoint[]> {
  const { data } = await supabase
    .from("metrics")
    .select(
      "created_at, stabilization_ratio, revert_rate, churn_events, commits_total, ai_detection_coverage_pct, pr_merged_count, pr_single_pass_rate, fix_latency_median_hours, cascade_rate",
    )
    .eq("repository_id", repositoryId)
    .order("created_at", { ascending: true })
    .limit(limit);

  return (data ?? []).map((row) => ({
    date: row.created_at,
    stabilization_ratio: row.stabilization_ratio,
    revert_rate: row.revert_rate,
    churn_events: row.churn_events,
    commits_total: row.commits_total,
    ai_detection_coverage_pct: row.ai_detection_coverage_pct,
    pr_merged_count: row.pr_merged_count,
    pr_single_pass_rate: row.pr_single_pass_rate,
    fix_latency_median_hours: row.fix_latency_median_hours,
    cascade_rate: row.cascade_rate,
  }));
}

/** Get the full JSONB payload from the latest run. */
export async function getRepoLatestPayload(
  supabase: SupabaseClient,
  repositoryId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from("metrics")
    .select("payload")
    .eq("repository_id", repositoryId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return (data?.payload as Record<string, unknown>) ?? null;
}

/** Get AI impact time series — origin-disaggregated metrics over time. */
export async function getRepoAITimeSeries(
  supabase: SupabaseClient,
  repositoryId: string,
  limit = 52,
): Promise<AIImpactPoint[]> {
  const { data } = await supabase
    .from("metrics")
    .select("created_at, payload, ai_detection_coverage_pct")
    .eq("repository_id", repositoryId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (!data) return [];

  return data
    .map((row) => {
      const p = (row.payload ?? {}) as Record<string, unknown>;

      const stabByOrigin = p.stabilization_by_origin as
        | Record<string, { stabilization_ratio: number }>
        | undefined;
      const durByOrigin = p.durability_by_origin as
        | Record<string, { survival_rate: number }>
        | undefined;
      const cascByOrigin = p.cascade_rate_by_origin as
        | Record<string, { cascade_rate: number }>
        | undefined;
      const originDist = p.commit_origin_distribution as
        | Record<string, number>
        | undefined;

      return {
        date: row.created_at,
        ai_pct: row.ai_detection_coverage_pct ?? null,
        stabilization_human: stabByOrigin?.HUMAN?.stabilization_ratio ?? null,
        stabilization_ai:
          stabByOrigin?.AI_ASSISTED?.stabilization_ratio ?? null,
        durability_human: durByOrigin?.HUMAN?.survival_rate ?? null,
        durability_ai: durByOrigin?.AI_ASSISTED?.survival_rate ?? null,
        cascade_human: cascByOrigin?.HUMAN?.cascade_rate ?? null,
        cascade_ai: cascByOrigin?.AI_ASSISTED?.cascade_rate ?? null,
        commits_human: originDist?.HUMAN ?? null,
        commits_ai: originDist?.AI_ASSISTED ?? null,
      } satisfies AIImpactPoint;
    })
    .filter((p) => p.ai_pct !== null && p.ai_pct > 0);
}

/** Get summary for all repos in an org (latest + previous for delta).
 *
 * Uses 2 bulk queries instead of 3N+1 per-repo queries:
 * 1. All repos in org
 * 2. All recent metrics for org (grouped client-side by repo)
 */
export async function getOrgReposSummary(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<RepoSummary[]> {
  // Query 1: all repos
  const { data: repos } = await supabase
    .from("repositories")
    .select("id, name, remote_url")
    .eq("organization_id", organizationId)
    .order("name");

  if (!repos || repos.length === 0) return [];

  // Query 2: all metrics for org, newest first (enough for sparkline + delta)
  const { data: allMetrics } = await supabase
    .from("metrics")
    .select(
      "repository_id, created_at, stabilization_ratio, revert_rate, churn_events, commits_total, ai_detection_coverage_pct, pr_merged_count, pr_single_pass_rate, fix_latency_median_hours, cascade_rate",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(repos.length * 15);

  // Group metrics by repository_id
  const metricsByRepo = new Map<string, typeof allMetrics>();
  for (const row of allMetrics ?? []) {
    const existing = metricsByRepo.get(row.repository_id) ?? [];
    existing.push(row);
    metricsByRepo.set(row.repository_id, existing);
  }

  return repos.map((repo) => {
    const rows = metricsByRepo.get(repo.id) ?? [];
    // rows are newest-first (from ORDER BY created_at DESC)
    const latest = rows[0] ?? null;
    const previous = rows[1] ?? null;

    const stabilization = latest?.stabilization_ratio ?? null;
    const prevStabilization = previous?.stabilization_ratio ?? null;
    const delta =
      stabilization !== null && prevStabilization !== null
        ? stabilization - prevStabilization
        : null;

    // Sparkline: last N values in chronological order (reverse the desc-sorted rows)
    const sparkline = rows
      .slice(0, SPARKLINE_POINTS)
      .reverse()
      .map((r) => r.stabilization_ratio)
      .filter((v): v is number => v !== null);

    return {
      id: repo.id,
      name: repo.name,
      remote_url: repo.remote_url,
      last_run_at: latest?.created_at ?? null,
      runs_count: rows.length,
      stabilization_ratio: stabilization,
      revert_rate: latest?.revert_rate ?? null,
      churn_events: latest?.churn_events ?? null,
      commits_total: latest?.commits_total ?? null,
      ai_detection_coverage_pct: latest?.ai_detection_coverage_pct ?? null,
      pr_merged_count: latest?.pr_merged_count ?? null,
      pr_single_pass_rate: latest?.pr_single_pass_rate ?? null,
      fix_latency_median_hours: latest?.fix_latency_median_hours ?? null,
      cascade_rate: latest?.cascade_rate ?? null,
      stabilization_delta: delta,
      health: classifyHealth(stabilization),
      sparkline,
    } satisfies RepoSummary;
  });
}

/** Detect significant changes between two consecutive runs. */
export function detectChanges(
  repoName: string,
  repoId: string,
  current: TimeSeriesPoint,
  previous: TimeSeriesPoint,
): ChangeDetection[] {
  const changes: ChangeDetection[] = [];

  function check(
    metric: string,
    description: string,
    curr: number | null,
    prev: number | null,
    thresholdPp: number,
    severity: ChangeDetection["severity"],
  ) {
    if (curr === null || prev === null) return;
    const delta = curr - prev;
    if (Math.abs(delta) >= thresholdPp) {
      changes.push({
        repository_name: repoName,
        repository_id: repoId,
        metric,
        description,
        severity,
        current_value: curr,
        previous_value: prev,
        delta,
      });
    }
  }

  // Stabilization drop > 10pp
  check(
    "stabilization_ratio",
    `Stabilization ${current.stabilization_ratio !== null && previous.stabilization_ratio !== null && current.stabilization_ratio < previous.stabilization_ratio ? "dropped" : "improved"} by ${Math.abs(((current.stabilization_ratio ?? 0) - (previous.stabilization_ratio ?? 0)) * 100).toFixed(0)}pp`,
    current.stabilization_ratio,
    previous.stabilization_ratio,
    0.1,
    current.stabilization_ratio !== null &&
      previous.stabilization_ratio !== null &&
      current.stabilization_ratio < previous.stabilization_ratio
      ? "warning"
      : "info",
  );

  // Revert rate increase > 5pp
  check(
    "revert_rate",
    `Revert rate changed by ${Math.abs(((current.revert_rate ?? 0) - (previous.revert_rate ?? 0)) * 100).toFixed(0)}pp`,
    current.revert_rate,
    previous.revert_rate,
    0.05,
    current.revert_rate !== null &&
      previous.revert_rate !== null &&
      current.revert_rate > previous.revert_rate
      ? "critical"
      : "info",
  );

  // AI coverage change > 15pp
  check(
    "ai_detection_coverage_pct",
    `AI adoption changed by ${Math.abs((current.ai_detection_coverage_pct ?? 0) - (previous.ai_detection_coverage_pct ?? 0)).toFixed(0)}pp`,
    current.ai_detection_coverage_pct,
    previous.ai_detection_coverage_pct,
    15,
    "info",
  );

  // Churn events doubling or more
  if (
    current.churn_events !== null &&
    previous.churn_events !== null &&
    previous.churn_events > 0 &&
    current.churn_events >= previous.churn_events * 2
  ) {
    changes.push({
      repository_name: repoName,
      repository_id: repoId,
      metric: "churn_events",
      description: `Churn events doubled (${previous.churn_events} → ${current.churn_events})`,
      severity: "warning",
      current_value: current.churn_events,
      previous_value: previous.churn_events,
      delta: current.churn_events - previous.churn_events,
    });
  }

  return changes;
}

/** Detect changes across all repos in an org. */
export async function getOrgChangeDetections(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<ChangeDetection[]> {
  const { data: repos } = await supabase
    .from("repositories")
    .select("id, name")
    .eq("organization_id", organizationId);

  if (!repos) return [];

  const allChanges: ChangeDetection[] = [];

  for (const repo of repos) {
    const { data: runs } = await supabase
      .from("metrics")
      .select(
        "created_at, stabilization_ratio, revert_rate, churn_events, commits_total, ai_detection_coverage_pct, pr_merged_count, pr_single_pass_rate, fix_latency_median_hours, cascade_rate",
      )
      .eq("repository_id", repo.id)
      .order("created_at", { ascending: false })
      .limit(2);

    if (!runs || runs.length < 2) continue;

    const current: TimeSeriesPoint = { date: runs[0].created_at, ...runs[0] };
    const previous: TimeSeriesPoint = { date: runs[1].created_at, ...runs[1] };

    allChanges.push(...detectChanges(repo.name, repo.id, current, previous));
  }

  // Sort by severity (critical first) then by absolute delta
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  allChanges.sort(
    (a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity] ||
      Math.abs(b.delta) - Math.abs(a.delta),
  );

  return allChanges.slice(0, 5);
}
