import { describe, expect, it } from "vitest";

import {
  FLOW_PHASE_ORDER,
  WAIT_PHASES,
  selectCycleTimeVerdict,
  summarizeFlow,
  type FlowRow,
} from "@/lib/queries/cycle-time-flow";
import { computeCycleTime } from "@/lib/queries/org-summary";
import type { ReportMetrics } from "@/types/metrics";
import type { FlowDecomposition } from "@/types/org-summary";
import type { RepoSummary } from "@/types/temporal";

// ---------------------------------------------------------------------------
// summarizeFlow
// ---------------------------------------------------------------------------

describe("summarizeFlow", () => {
  it("weights per-repo phase medians by merged count and picks the dominant", () => {
    const rows: FlowRow[] = [
      { merged: 10, phases: { coding: 2, awaiting_first_review: 8 } },
      { merged: 30, phases: { coding: 6, awaiting_first_review: 2 } },
    ];
    const out = summarizeFlow(rows, 40)!;

    // coding = (2*10 + 6*30)/40 = 5 ; awaiting = (8*10 + 2*30)/40 = 3.5
    expect(out.phaseMedianHours.coding).toBe(5);
    expect(out.phaseMedianHours.awaiting_first_review).toBe(3.5);
    expect(out.dominantPhase).toEqual({
      key: "coding",
      hours: 5,
      sharePct: 58.8, // round(5 / 8.5 * 100, 1)
      isWait: false,
    });
    expect(out.prsWithFlow).toBe(40);
    expect(out.flowCoveragePct).toBe(1);
  });

  it("flags a wait phase as the actionable dominant kind", () => {
    const rows: FlowRow[] = [
      { merged: 5, phases: { coding: 1, awaiting_first_review: 9 } },
    ];
    const out = summarizeFlow(rows, 5)!;
    expect(out.dominantPhase?.key).toBe("awaiting_first_review");
    expect(out.dominantPhase?.isWait).toBe(true);
  });

  it("reports partial coverage when some merged PRs lack phase data", () => {
    const rows: FlowRow[] = [{ merged: 20, phases: { coding: 4 } }];
    const out = summarizeFlow(rows, 50)!; // 30 merged PRs carried no phase data
    expect(out.prsWithFlow).toBe(20);
    expect(out.flowCoveragePct).toBe(0.4);
  });

  it("weights TTFR and flow efficiency only over rows that carry them", () => {
    const rows: FlowRow[] = [
      { merged: 10, phases: { coding: 1 }, ttfrHours: 12, flowEfficiency: 0.5 },
      { merged: 30, phases: { coding: 1 }, ttfrHours: null }, // skipped for ttfr/eff
    ];
    const out = summarizeFlow(rows, 40)!;
    expect(out.medianTimeToFirstReviewHours).toBe(12); // only the 10-weight row
    expect(out.flowEfficiencyMedian).toBe(0.5);
  });

  it("returns null when no row carries phase data", () => {
    expect(summarizeFlow([], 10)).toBeNull();
    expect(
      summarizeFlow([{ merged: 0, phases: { coding: 5 } }], 10),
    ).toBeNull();
  });

  it("returns a decomposition with no dominant phase when all phases are zero", () => {
    const out = summarizeFlow([{ merged: 5, phases: {} }], 5)!;
    expect(out.dominantPhase).toBeNull();
    expect(out.prsWithFlow).toBe(5);
    expect(out.flowCoveragePct).toBe(1);
  });

  it("returns null coverage when the total merged count is unknown", () => {
    const out = summarizeFlow([{ merged: 5, phases: { coding: 2 } }], 0)!;
    expect(out.flowCoveragePct).toBeNull();
  });

  it("breaks ties toward the earlier phase deterministically", () => {
    const out = summarizeFlow(
      [{ merged: 1, phases: { coding: 4, awaiting_merge: 4 } }],
      1,
    )!;
    expect(out.dominantPhase?.key).toBe("coding");
  });

  it("exposes the canonical order and the wait-phase set", () => {
    expect(FLOW_PHASE_ORDER).toEqual([
      "coding",
      "awaiting_first_review",
      "in_review_active",
      "in_review_wait",
      "awaiting_merge",
    ]);
    expect(WAIT_PHASES.has("in_review_wait")).toBe(true);
    expect(WAIT_PHASES.has("coding")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// selectCycleTimeVerdict
// ---------------------------------------------------------------------------

const OPTS = { minMerged: 50, coverageFloor: 0.6 };

function flow(over: Partial<FlowDecomposition>): FlowDecomposition {
  return {
    phaseMedianHours: {
      coding: 1,
      awaiting_first_review: 4,
      in_review_active: 1,
      in_review_wait: 1,
      awaiting_merge: 1,
    },
    medianTimeToFirstReviewHours: 4,
    flowEfficiencyMedian: 0.3,
    dominantPhase: {
      key: "awaiting_first_review",
      hours: 4,
      sharePct: 50,
      isWait: true,
    },
    prsWithFlow: 80,
    flowCoveragePct: 0.9,
    ...over,
  };
}

describe("selectCycleTimeVerdict", () => {
  it("returns none when there are too few merged PRs", () => {
    const v = selectCycleTimeVerdict(
      { totalPRsMerged: 10, pctMergedWithin24h: 0.7, flow: flow({}) },
      OPTS,
    );
    expect(v.variant).toBe("none");
  });

  it("returns none when the within-24h figure is missing", () => {
    const v = selectCycleTimeVerdict(
      { totalPRsMerged: 100, pctMergedWithin24h: null, flow: flow({}) },
      OPTS,
    );
    expect(v.variant).toBe("none");
  });

  it("returns noFlow when there is no decomposition", () => {
    const v = selectCycleTimeVerdict(
      { totalPRsMerged: 100, pctMergedWithin24h: 0.7, flow: null },
      OPTS,
    );
    expect(v.variant).toBe("noFlow");
    expect(v.dominantPhase).toBeNull();
  });

  it("returns noFlow when the decomposition has no dominant phase", () => {
    const v = selectCycleTimeVerdict(
      {
        totalPRsMerged: 100,
        pctMergedWithin24h: 0.7,
        flow: flow({ dominantPhase: null }),
      },
      OPTS,
    );
    expect(v.variant).toBe("noFlow");
  });

  it("returns lowCoverage below the coverage floor", () => {
    const v = selectCycleTimeVerdict(
      {
        totalPRsMerged: 100,
        pctMergedWithin24h: 0.7,
        flow: flow({ flowCoveragePct: 0.4 }),
      },
      OPTS,
    );
    expect(v.variant).toBe("lowCoverage");
    expect(v.flowCoveragePct).toBe(0.4);
  });

  it("returns the full verdict at or above the coverage floor", () => {
    const v = selectCycleTimeVerdict(
      {
        totalPRsMerged: 100,
        pctMergedWithin24h: 0.7,
        flow: flow({ flowCoveragePct: 0.6 }),
      },
      OPTS,
    );
    expect(v.variant).toBe("verdict");
    expect(v.dominantPhase?.key).toBe("awaiting_first_review");
    expect(v.prsWithFlow).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// computeCycleTime — flow wiring (integration)
// ---------------------------------------------------------------------------

const repos = [
  { id: "r1", name: "checkout" },
  { id: "r2", name: "orders" },
] as unknown as RepoSummary[];

function metrics(over: Partial<ReportMetrics>): ReportMetrics {
  return {
    commits_total: 0,
    commits_revert: 0,
    revert_rate: 0,
    churn_events: 0,
    churn_lines_affected: 0,
    files_touched: 0,
    files_stabilized: 0,
    stabilization_ratio: 0,
    pr_cycle_time_buckets: {
      same_day: 0,
      one_day: 0,
      two_to_three_days: 0,
      four_to_seven_days: 0,
      seven_plus_days: 0,
    },
    ...over,
  } as ReportMetrics;
}

describe("computeCycleTime — flow decomposition", () => {
  it("aggregates phase data the engine emits into data.flow", () => {
    const payloads = new Map<string, ReportMetrics>();
    payloads.set(
      "r1",
      metrics({
        pr_merged_count: 20,
        pr_cycle_time_buckets: {
          same_day: 12,
          one_day: 4,
          two_to_three_days: 2,
          four_to_seven_days: 1,
          seven_plus_days: 1,
        },
        time_in_phase_median_hours: { coding: 2, awaiting_first_review: 10 },
        median_time_to_first_review_hours: 10,
      }),
    );
    payloads.set(
      "r2",
      metrics({
        pr_merged_count: 30,
        pr_cycle_time_buckets: {
          same_day: 20,
          one_day: 6,
          two_to_three_days: 2,
          four_to_seven_days: 1,
          seven_plus_days: 1,
        },
        time_in_phase_median_hours: { coding: 3, awaiting_first_review: 3 },
      }),
    );

    const out = computeCycleTime(repos, payloads)!;
    expect(out.flow).not.toBeNull();
    // awaiting = (10*20 + 3*30)/50 = 5.8 ; coding = (2*20 + 3*30)/50 = 2.6
    expect(out.flow!.phaseMedianHours.awaiting_first_review).toBe(5.8);
    expect(out.flow!.dominantPhase?.key).toBe("awaiting_first_review");
    expect(out.flow!.flowCoveragePct).toBe(1);
  });

  it("leaves data.flow null when no payload carries phase data", () => {
    const payloads = new Map<string, ReportMetrics>();
    payloads.set(
      "r1",
      metrics({
        pr_merged_count: 10,
        pr_cycle_time_buckets: {
          same_day: 8,
          one_day: 2,
          two_to_three_days: 0,
          four_to_seven_days: 0,
          seven_plus_days: 0,
        },
      }),
    );
    const out = computeCycleTime(repos, payloads)!;
    expect(out.flow).toBeNull();
  });
});
