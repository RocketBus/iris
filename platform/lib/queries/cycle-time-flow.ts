/**
 * Cycle Time — flow decomposition + honest verdict selection.
 *
 * Pure functions behind the dashboard's Cycle Time card. They turn the
 * per-repo phase medians the engine already emits (`time_in_phase_median_hours`)
 * into an org-level decomposition and a *computed* verdict — replacing the old
 * hardcoded editorial sentence about where bottlenecks "live".
 *
 * The verdict only ever describes the code window it actually measures
 * (PR open -> merge); it never claims anything about the "before" (demand)
 * or "after" (deploy) windows, which the engine does not measure here.
 *
 * No I/O, no per-PR data: fully unit-testable.
 */
import type {
  DominantPhase,
  FlowDecomposition,
  FlowPhaseKey,
} from "@/types/org-summary";

/** Canonical phase order (earliest lifecycle stage first). */
export const FLOW_PHASE_ORDER: readonly FlowPhaseKey[] = [
  "coding",
  "awaiting_first_review",
  "in_review_active",
  "in_review_wait",
  "awaiting_merge",
];

/** Phases that are *waiting* (queue) rather than *active* (work being done). */
export const WAIT_PHASES: ReadonlySet<FlowPhaseKey> = new Set<FlowPhaseKey>([
  "awaiting_first_review",
  "in_review_wait",
  "awaiting_merge",
]);

/** One repo's contribution to the org-level flow aggregation. */
export interface FlowRow {
  /** Merged PRs in the window — the aggregation weight. */
  merged: number;
  /** Per-phase median hours for this repo (engine output). */
  phases: Partial<Record<FlowPhaseKey, number>>;
  ttfrHours?: number | null;
  flowEfficiency?: number | null;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Aggregate per-repo phase medians into an org-level decomposition, weighted
 * by merged-PR count. This is a weighted average of per-repo medians — an
 * approximation (we never persist per-PR timings, by design), so callers MUST
 * gate display on `flowCoveragePct`. Returns null when no row carried phase
 * data (e.g. only older payloads in the window).
 */
export function summarizeFlow(
  rows: FlowRow[],
  totalMerged: number,
): FlowDecomposition | null {
  const weighted: Record<FlowPhaseKey, number> = {
    coding: 0,
    awaiting_first_review: 0,
    in_review_active: 0,
    in_review_wait: 0,
    awaiting_merge: 0,
  };
  let weight = 0;
  let ttfrWeighted = 0;
  let ttfrWeight = 0;
  let effWeighted = 0;
  let effWeight = 0;

  for (const row of rows) {
    if (!row.phases || row.merged <= 0) continue;
    weight += row.merged;
    for (const key of FLOW_PHASE_ORDER) {
      weighted[key] += (row.phases[key] ?? 0) * row.merged;
    }
    if (row.ttfrHours != null) {
      ttfrWeighted += row.ttfrHours * row.merged;
      ttfrWeight += row.merged;
    }
    if (row.flowEfficiency != null) {
      effWeighted += row.flowEfficiency * row.merged;
      effWeight += row.merged;
    }
  }

  if (weight <= 0) return null;

  const phaseMedianHours = {} as Record<FlowPhaseKey, number>;
  for (const key of FLOW_PHASE_ORDER) {
    phaseMedianHours[key] = round(weighted[key] / weight, 1);
  }

  const totalHours = FLOW_PHASE_ORDER.reduce(
    (sum, key) => sum + phaseMedianHours[key],
    0,
  );
  let dominantPhase: DominantPhase | null = null;
  if (totalHours > 0) {
    // Ties resolve to the earlier (lower-index) phase — deterministic.
    const key = FLOW_PHASE_ORDER.reduce((best, candidate) =>
      phaseMedianHours[candidate] > phaseMedianHours[best] ? candidate : best,
    );
    dominantPhase = {
      key,
      hours: phaseMedianHours[key],
      sharePct: round((phaseMedianHours[key] / totalHours) * 100, 1),
      isWait: WAIT_PHASES.has(key),
    };
  }

  return {
    phaseMedianHours,
    medianTimeToFirstReviewHours:
      ttfrWeight > 0 ? round(ttfrWeighted / ttfrWeight, 1) : null,
    flowEfficiencyMedian:
      effWeight > 0 ? round(effWeighted / effWeight, 3) : null,
    dominantPhase,
    prsWithFlow: weight,
    flowCoveragePct: totalMerged > 0 ? weight / totalMerged : null,
  };
}

export type CycleTimeVerdictVariant =
  | "verdict"
  | "lowCoverage"
  | "noFlow"
  | "none";

export interface CycleTimeVerdict {
  variant: CycleTimeVerdictVariant;
  dominantPhase: DominantPhase | null;
  prsWithFlow: number | null;
  /** 0.0–1.0 */
  flowCoveragePct: number | null;
}

/**
 * Decide which honest verdict the card shows.
 *
 * - `none`        — not enough merged PRs (or no within-24h figure): show nothing.
 * - `noFlow`      — dense enough, but no phase decomposition: state the KPIs and
 *                   explicitly make NO claim about where the bottleneck is.
 * - `lowCoverage` — decomposition exists but covers too little: show as a sample.
 * - `verdict`     — full computed read of the dominant code-window phase.
 */
export function selectCycleTimeVerdict(
  data: {
    totalPRsMerged: number;
    pctMergedWithin24h: number | null;
    flow: FlowDecomposition | null;
  },
  opts: { minMerged: number; coverageFloor: number },
): CycleTimeVerdict {
  const base = {
    dominantPhase: data.flow?.dominantPhase ?? null,
    prsWithFlow: data.flow?.prsWithFlow ?? null,
    flowCoveragePct: data.flow?.flowCoveragePct ?? null,
  };
  if (
    data.totalPRsMerged < opts.minMerged ||
    data.pctMergedWithin24h === null
  ) {
    return { variant: "none", ...base };
  }
  if (!data.flow || !data.flow.dominantPhase) {
    return { variant: "noFlow", ...base };
  }
  if ((data.flow.flowCoveragePct ?? 0) < opts.coverageFloor) {
    return { variant: "lowCoverage", ...base };
  }
  return { variant: "verdict", ...base };
}
