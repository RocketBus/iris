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

/**
 * Default lookback window in days. Mirrors the engine CLI's
 * `iris analyze --days` default. Every read from `metrics` filters by
 * `window_days` so a tenant ingesting multiple windows per repo (issue
 * #80) doesn't pollute sparklines and deltas with mixed-window points.
 */
export const DEFAULT_WINDOW_DAYS = 90;

/**
 * Distinct analysis windows (`window_days`) that actually have ingested
 * metrics for an org, optionally narrowed to one repo, ascending.
 *
 * Drives the window selector (issue #80): we only offer windows that have
 * data so picking one never lands on an empty page, and the selector stays
 * hidden until a tenant ingests more than one window. Returns `[]` when the
 * org has no metrics yet. The distinct set is tiny (the CLI only produces
 * 7/15/30/60/90), so scanning recent rows and deduplicating client-side is
 * cheaper than a DB-side DISTINCT and is covered by the composite index.
 */
export async function getAvailableWindowDays(
  supabase: SupabaseClient,
  organizationId: string,
  repositoryId?: string,
): Promise<number[]> {
  let q = supabase
    .from("metrics")
    .select("window_days")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (repositoryId !== undefined) q = q.eq("repository_id", repositoryId);

  const { data } = await q;

  const windows = new Set<number>();
  for (const row of data ?? []) {
    if (typeof row.window_days === "number") windows.add(row.window_days);
  }
  return [...windows].sort((a, b) => a - b);
}

/**
 * Resolve the effective window from a (possibly absent or invalid) request
 * and the set of windows that have data. Prefers the request when it has
 * data, else the default window if present, else the largest available, and
 * finally falls back to the default so callers always get a usable number.
 */
export function resolveWindowDays(
  requested: number | null | undefined,
  available: number[],
): number {
  if (requested != null && available.includes(requested)) return requested;
  if (available.includes(DEFAULT_WINDOW_DAYS)) return DEFAULT_WINDOW_DAYS;
  if (available.length > 0) return available[available.length - 1];
  return DEFAULT_WINDOW_DAYS;
}

/** Parse a `?window=` search param into a positive integer, or null. */
export function parseWindowParam(
  raw: string | string[] | undefined,
): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Get time series for a repo (all analysis runs, ascending). */
export async function getRepoTimeSeries(
  supabase: SupabaseClient,
  repositoryId: string,
  limit = 52,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<TimeSeriesPoint[]> {
  const { data } = await supabase
    .from("metrics")
    .select(
      "created_at, stabilization_ratio, revert_rate, churn_events, commits_total, ai_detection_coverage_pct",
    )
    .eq("repository_id", repositoryId)
    .eq("window_days", windowDays)
    .order("created_at", { ascending: true })
    .limit(limit);

  return (data ?? []).map((row) => ({
    date: row.created_at,
    stabilization_ratio: row.stabilization_ratio,
    revert_rate: row.revert_rate,
    churn_events: row.churn_events,
    commits_total: row.commits_total,
    ai_detection_coverage_pct: row.ai_detection_coverage_pct,
  }));
}

/** Get the full JSONB payload from the latest run. */
export async function getRepoLatestPayload(
  supabase: SupabaseClient,
  repositoryId: string,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from("metrics")
    .select("payload")
    .eq("repository_id", repositoryId)
    .eq("window_days", windowDays)
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
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<AIImpactPoint[]> {
  const { data } = await supabase
    .from("metrics")
    .select("created_at, payload, ai_detection_coverage_pct")
    .eq("repository_id", repositoryId)
    .eq("window_days", windowDays)
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
 * 2. One pre-aggregated row per repo from the `repo_metric_summaries` view
 *
 * Query 2 deliberately reads the view rather than raw `metrics`: a raw fetch
 * needs a row limit, and PostgREST silently caps every response at the
 * project's "Max rows" (default 1000). Once an org had > 1000 metric rows in a
 * window, repos whose latest run fell outside the newest-1000 slice came back
 * with zero rows and rendered "0 runs" despite having metrics. The view
 * returns ~one row per repo, so the result set stays well under any cap.
 */
export async function getOrgReposSummary(
  supabase: SupabaseClient,
  organizationId: string,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<RepoSummary[]> {
  // Query 1: all repos
  const { data: repos } = await supabase
    .from("repositories")
    .select("id, name, remote_url")
    .eq("organization_id", organizationId)
    .order("name");

  if (!repos || repos.length === 0) return [];

  // Query 2: pre-aggregated summary, one row per repo (see doc comment).
  const { data: summaries } = await supabase
    .from("repo_metric_summaries")
    .select(
      "repository_id, runs_count, last_run_at, stabilization_ratio, prev_stabilization_ratio, revert_rate, churn_events, commits_total, ai_detection_coverage_pct, pr_merged_count, pr_single_pass_rate, fix_latency_median_hours, cascade_rate, merge_strategy, commit_metrics_reliable, recent_stabilization",
    )
    .eq("organization_id", organizationId)
    .eq("window_days", windowDays);

  const summaryByRepo = new Map<
    string,
    NonNullable<typeof summaries>[number]
  >();
  for (const row of summaries ?? []) summaryByRepo.set(row.repository_id, row);

  return repos.map((repo) => {
    const s = summaryByRepo.get(repo.id) ?? null;

    const stabilization = s?.stabilization_ratio ?? null;
    const prevStabilization = s?.prev_stabilization_ratio ?? null;
    const delta =
      stabilization !== null && prevStabilization !== null
        ? stabilization - prevStabilization
        : null;

    // recent_stabilization is newest-first; take the last N, reverse to
    // chronological order, drop nulls — matching the previous behaviour.
    const sparkline = (s?.recent_stabilization ?? [])
      .slice(0, SPARKLINE_POINTS)
      .reverse()
      .filter((v: number | null): v is number => v !== null);

    return {
      id: repo.id,
      name: repo.name,
      remote_url: repo.remote_url,
      last_run_at: s?.last_run_at ?? null,
      runs_count: s?.runs_count ?? 0,
      stabilization_ratio: stabilization,
      revert_rate: s?.revert_rate ?? null,
      churn_events: s?.churn_events ?? null,
      commits_total: s?.commits_total ?? null,
      ai_detection_coverage_pct: s?.ai_detection_coverage_pct ?? null,
      pr_merged_count: s?.pr_merged_count ?? null,
      pr_single_pass_rate: s?.pr_single_pass_rate ?? null,
      fix_latency_median_hours: s?.fix_latency_median_hours ?? null,
      cascade_rate: s?.cascade_rate ?? null,
      merge_strategy: s?.merge_strategy ?? null,
      commit_metrics_reliable: s?.commit_metrics_reliable ?? null,
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
  windowDays: number = DEFAULT_WINDOW_DAYS,
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
      .eq("window_days", windowDays)
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
