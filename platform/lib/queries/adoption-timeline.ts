/**
 * Adoption timeline extraction and delta computation.
 *
 * Reads the `adoption_timeline` field produced by iris/analysis/adoption_detector.py
 * (written by iris/reports/writer.py) and shapes it for the platform UI.
 *
 * The engine already splits commits into pre/post-adoption windows and reports
 * the full ReportMetrics for each side; here we reduce both sides into a small
 * list of comparable rows (stabilization, durability, cascade, revert, new-code churn).
 */

import type {
  AdoptionConfidence,
  AdoptionTimeline,
  ReportMetrics,
} from "@/types/metrics";

export type AdoptionDeltaDirection = "up" | "down" | "flat";

export interface AdoptionDelta {
  /** Stable key for i18n lookups. */
  key: "stabilization" | "durability" | "cascade" | "revert" | "newCodeChurn";
  /** Pre-adoption value on a 0–1 scale (ratio/percentage). */
  pre: number | null;
  /** Post-adoption value on a 0–1 scale (ratio/percentage). */
  post: number | null;
  /** post − pre in percentage points; null when either side is null. */
  deltaPp: number | null;
  /** "up" means improvement, "down" means regression, "flat" < 2pp. */
  direction: AdoptionDeltaDirection;
  /** Whether a larger value is a good outcome (e.g. stabilization↑ good; cascade↓ good). */
  higherIsBetter: boolean;
}

export interface AdoptionSummary {
  inflection: string;                  // YYYY-MM-DD
  rampEnd: string | null;
  confidence: AdoptionConfidence;
  totalAiCommits: number;
  deltas: AdoptionDelta[];
}

export interface RepoAdoption extends AdoptionSummary {
  repoId: string;
  repoName: string;
  headlineDeltaPp: number | null;
}

const FLAT_THRESHOLD_PP = 2;

function weightedDurabilitySurvival(m: ReportMetrics | undefined): number | null {
  if (!m?.durability_by_origin) return null;
  let surviving = 0;
  let introduced = 0;
  for (const entry of Object.values(m.durability_by_origin)) {
    surviving += entry.lines_surviving;
    introduced += entry.lines_introduced;
  }
  if (introduced <= 0) return null;
  return surviving / introduced;
}

function weightedCascadeRate(m: ReportMetrics | undefined): number | null {
  if (m?.cascade_rate != null) return m.cascade_rate;
  if (!m?.cascade_rate_by_origin) return null;
  let cascades = 0;
  let total = 0;
  for (const entry of Object.values(m.cascade_rate_by_origin)) {
    cascades += entry.cascades;
    total += entry.total_commits;
  }
  if (total <= 0) return null;
  return cascades / total;
}

function toPp(pre: number | null, post: number | null): number | null {
  if (pre == null || post == null) return null;
  return (post - pre) * 100;
}

function classifyDirection(
  deltaPp: number | null,
  higherIsBetter: boolean,
): AdoptionDeltaDirection {
  if (deltaPp == null) return "flat";
  if (Math.abs(deltaPp) < FLAT_THRESHOLD_PP) return "flat";
  const rising = deltaPp > 0;
  return rising === higherIsBetter ? "up" : "down";
}

function buildDelta(
  key: AdoptionDelta["key"],
  pre: number | null,
  post: number | null,
  higherIsBetter: boolean,
): AdoptionDelta {
  const deltaPp = toPp(pre, post);
  return {
    key,
    pre,
    post,
    deltaPp,
    direction: classifyDirection(deltaPp, higherIsBetter),
    higherIsBetter,
  };
}

function extractDeltas(timeline: AdoptionTimeline): AdoptionDelta[] {
  const pre = timeline.pre_adoption;
  const post = timeline.post_adoption;

  return [
    buildDelta(
      "stabilization",
      pre?.stabilization_ratio ?? null,
      post?.stabilization_ratio ?? null,
      true,
    ),
    buildDelta(
      "durability",
      weightedDurabilitySurvival(pre),
      weightedDurabilitySurvival(post),
      true,
    ),
    buildDelta(
      "cascade",
      weightedCascadeRate(pre),
      weightedCascadeRate(post),
      false,
    ),
    buildDelta(
      "revert",
      pre?.revert_rate ?? null,
      post?.revert_rate ?? null,
      false,
    ),
    buildDelta(
      "newCodeChurn",
      pre?.new_code_churn_rate_4w ?? null,
      post?.new_code_churn_rate_4w ?? null,
      false,
    ),
  ];
}

export function extractAdoptionSummary(
  payload: ReportMetrics | null | undefined,
): AdoptionSummary | null {
  const t = payload?.adoption_timeline;
  if (!t) return null;
  return {
    inflection: t.adoption_ramp_start,
    rampEnd: t.adoption_ramp_end,
    confidence: t.adoption_confidence,
    totalAiCommits: t.total_ai_commits,
    deltas: extractDeltas(t),
  };
}

/**
 * Org view: one row per repo that has a clear or sparse adoption event.
 * The headline delta is stabilization_ratio post-minus-pre in percentage points.
 */
export function computeOrgAdoption(
  payloads: Map<string, ReportMetrics>,
  repoIndex: Map<string, string>,
): RepoAdoption[] {
  const rows: RepoAdoption[] = [];
  for (const [repoId, payload] of payloads) {
    const summary = extractAdoptionSummary(payload);
    if (!summary) continue;
    if (summary.confidence === "insufficient") continue;

    const stabilization = summary.deltas.find((d) => d.key === "stabilization");
    rows.push({
      ...summary,
      repoId,
      repoName: repoIndex.get(repoId) ?? repoId,
      headlineDeltaPp: stabilization?.deltaPp ?? null,
    });
  }

  // Most recent adoptions first; ties broken by headline delta magnitude.
  rows.sort((a, b) => {
    if (a.inflection !== b.inflection) {
      return a.inflection < b.inflection ? 1 : -1;
    }
    const am = Math.abs(a.headlineDeltaPp ?? 0);
    const bm = Math.abs(b.headlineDeltaPp ?? 0);
    return bm - am;
  });

  return rows;
}
