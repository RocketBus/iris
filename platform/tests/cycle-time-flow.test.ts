import { describe, expect, it } from "vitest";

import {
  FLOW_PHASE_ORDER,
  WAIT_PHASES,
  WINDOW_PHASES,
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
  it("weights per-repo phase medians by the decomposed-PR count and picks the window dominant", () => {
    const rows: FlowRow[] = [
      { weight: 10, phases: { awaiting_first_review: 8, in_review_active: 2 } },
      { weight: 30, phases: { awaiting_first_review: 2, in_review_active: 6 } },
    ];
    const out = summarizeFlow(rows, 40)!;

    // awaiting = (8*10 + 2*30)/40 = 3.5 ; active = (2*10 + 6*30)/40 = 5
    expect(out.phaseMedianHours.awaiting_first_review).toBe(3.5);
    expect(out.phaseMedianHours.in_review_active).toBe(5);
    expect(out.dominantPhase).toEqual({
      key: "in_review_active",
      hours: 5,
      sharePct: 58.8, // round(5 / 8.5 * 100, 1)
    });
    expect(WAIT_PHASES.has(out.dominantPhase!.key)).toBe(false);
    expect(out.prsWithFlow).toBe(40);
    expect(out.flowCoveragePct).toBe(1);
  });

  it("never lets 'coding' (pre-PR-open authoring) win the verdict — M2", () => {
    // coding is the largest phase, but it is OUTSIDE the measured window.
    const rows: FlowRow[] = [
      {
        weight: 10,
        phases: { coding: 20, awaiting_first_review: 8, in_review_wait: 2 },
      },
    ];
    const out = summarizeFlow(rows, 10)!;
    // coding is still computed in the data...
    expect(out.phaseMedianHours.coding).toBe(20);
    // ...but the dominant is the largest WINDOW phase, and the share denominator
    // is the window total (8 + 2 = 10), not the all-phase total.
    expect(out.dominantPhase?.key).toBe("awaiting_first_review");
    expect(out.dominantPhase?.hours).toBe(8);
    expect(out.dominantPhase?.sharePct).toBe(80); // 8 / 10 window total
    expect(WAIT_PHASES.has(out.dominantPhase!.key)).toBe(true);
  });

  it("reports partial coverage from the decomposed count, not total merged — M3", () => {
    const rows: FlowRow[] = [{ weight: 20, phases: { in_review_wait: 4 } }];
    const out = summarizeFlow(rows, 50)!; // 50 merged, only 20 decomposed
    expect(out.prsWithFlow).toBe(20);
    expect(out.flowCoveragePct).toBe(0.4);
  });

  it("weights TTFR and flow efficiency only over rows that carry them", () => {
    const rows: FlowRow[] = [
      {
        weight: 10,
        phases: { awaiting_first_review: 1 },
        ttfrHours: 12,
        flowEfficiency: 0.5,
      },
      { weight: 30, phases: { awaiting_first_review: 1 }, ttfrHours: null },
    ];
    const out = summarizeFlow(rows, 40)!;
    expect(out.medianTimeToFirstReviewHours).toBe(12);
    expect(out.flowEfficiencyMedian).toBe(0.5);
  });

  it("returns null when no row carries decomposed phase data", () => {
    expect(summarizeFlow([], 10)).toBeNull();
    expect(
      summarizeFlow([{ weight: 0, phases: { awaiting_first_review: 5 } }], 10),
    ).toBeNull();
  });

  it("has no dominant phase when every window phase is zero (even if coding > 0)", () => {
    const out = summarizeFlow([{ weight: 5, phases: { coding: 9 } }], 5)!;
    expect(out.dominantPhase).toBeNull();
    expect(out.phaseMedianHours.coding).toBe(9);
    expect(out.prsWithFlow).toBe(5);
    expect(out.flowCoveragePct).toBe(1);
  });

  it("returns null coverage when the total merged count is unknown", () => {
    const out = summarizeFlow(
      [{ weight: 5, phases: { awaiting_first_review: 2 } }],
      0,
    )!;
    expect(out.flowCoveragePct).toBeNull();
  });

  it("breaks ties toward the earlier window phase deterministically", () => {
    const out = summarizeFlow(
      [{ weight: 1, phases: { awaiting_first_review: 4, awaiting_merge: 4 } }],
      1,
    )!;
    expect(out.dominantPhase?.key).toBe("awaiting_first_review");
  });

  it("exposes the canonical order, the window phases, and the wait-phase set", () => {
    expect(FLOW_PHASE_ORDER).toEqual([
      "coding",
      "awaiting_first_review",
      "in_review_active",
      "in_review_wait",
      "awaiting_merge",
    ]);
    expect(WINDOW_PHASES).toEqual([
      "awaiting_first_review",
      "in_review_active",
      "in_review_wait",
      "awaiting_merge",
    ]);
    expect(WINDOW_PHASES).not.toContain("coding");
    expect(WAIT_PHASES.has("in_review_wait")).toBe(true);
    expect(WAIT_PHASES.has("in_review_active")).toBe(false);
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
      sharePct: 57.1,
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
  it("aggregates phase data weighted by flow_pr_count and excludes coding", () => {
    const payloads = new Map<string, ReportMetrics>();
    payloads.set(
      "r1",
      metrics({
        pr_merged_count: 20,
        flow_pr_count: 20,
        pr_cycle_time_buckets: {
          same_day: 12,
          one_day: 4,
          two_to_three_days: 2,
          four_to_seven_days: 1,
          seven_plus_days: 1,
        },
        time_in_phase_median_hours: { coding: 30, awaiting_first_review: 10 },
      }),
    );
    payloads.set(
      "r2",
      metrics({
        pr_merged_count: 30,
        flow_pr_count: 30,
        pr_cycle_time_buckets: {
          same_day: 20,
          one_day: 6,
          two_to_three_days: 2,
          four_to_seven_days: 1,
          seven_plus_days: 1,
        },
        time_in_phase_median_hours: { coding: 30, awaiting_first_review: 3 },
      }),
    );

    const out = computeCycleTime(repos, payloads)!;
    expect(out.flow).not.toBeNull();
    // awaiting = (10*20 + 3*30)/50 = 5.8 ; coding present but EXCLUDED from dominant
    expect(out.flow!.phaseMedianHours.awaiting_first_review).toBe(5.8);
    expect(out.flow!.phaseMedianHours.coding).toBe(30);
    expect(out.flow!.dominantPhase?.key).toBe("awaiting_first_review");
    expect(out.flow!.flowCoveragePct).toBe(1); // 50 decomposed / 50 merged
  });

  it("yields partial coverage when flow_pr_count < merged — M3 guard-rail is live", () => {
    const payloads = new Map<string, ReportMetrics>();
    payloads.set(
      "r1",
      metrics({
        pr_merged_count: 100,
        flow_pr_count: 40, // only 40 of 100 merged PRs were decomposed
        pr_cycle_time_buckets: {
          same_day: 60,
          one_day: 20,
          two_to_three_days: 10,
          four_to_seven_days: 6,
          seven_plus_days: 4,
        },
        time_in_phase_median_hours: { awaiting_first_review: 9 },
      }),
    );
    const out = computeCycleTime(repos, payloads)!;
    expect(out.flow!.flowCoveragePct).toBe(0.4);
    expect(out.flow!.prsWithFlow).toBe(40);
  });

  it("leaves data.flow null when phase data has no flow_pr_count (old payloads) — M3", () => {
    const payloads = new Map<string, ReportMetrics>();
    payloads.set(
      "r1",
      metrics({
        pr_merged_count: 60,
        // time_in_phase present but NO flow_pr_count → cannot trust coverage
        time_in_phase_median_hours: { awaiting_first_review: 5 },
        pr_cycle_time_buckets: {
          same_day: 40,
          one_day: 12,
          two_to_three_days: 4,
          four_to_seven_days: 2,
          seven_plus_days: 2,
        },
      }),
    );
    const out = computeCycleTime(repos, payloads)!;
    expect(out.flow).toBeNull();
  });

  it("leaves data.flow null when no payload carries phase data", () => {
    const payloads = new Map<string, ReportMetrics>();
    payloads.set(
      "r1",
      metrics({
        pr_merged_count: 10,
        flow_pr_count: 10,
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
