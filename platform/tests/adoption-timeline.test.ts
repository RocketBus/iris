import { describe, expect, it } from "vitest";

import { extractAdoptionSummary } from "@/lib/queries/adoption-timeline";
import type { ReportMetrics } from "@/types/metrics";

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
    ...over,
  } as ReportMetrics;
}

describe("extractAdoptionSummary — flat threshold matches PP_STABLE", () => {
  it("classifies a 2.5pp stabilization move as flat, not up (was flagged at 2pp before)", () => {
    const summary = extractAdoptionSummary(
      metrics({
        adoption_timeline: {
          first_ai_commit_date: "2026-01-01",
          adoption_ramp_start: "2026-01-15",
          adoption_ramp_end: null,
          adoption_confidence: "clear",
          total_ai_commits: 10,
          pre_adoption: metrics({ stabilization_ratio: 0.7 }),
          post_adoption: metrics({ stabilization_ratio: 0.725 }),
        },
      }),
    );

    const stab = summary?.deltas.find((d) => d.key === "stabilization");
    expect(stab?.deltaPp).toBeCloseTo(2.5, 5);
    // 2.5pp is under the engine's own PP_STABLE (5pp) floor for "not noise"
    // — the old 2pp threshold here would have called this "up".
    expect(stab?.direction).toBe("flat");
  });

  it("classifies a 6pp stabilization move as up (above PP_STABLE)", () => {
    const summary = extractAdoptionSummary(
      metrics({
        adoption_timeline: {
          first_ai_commit_date: "2026-01-01",
          adoption_ramp_start: "2026-01-15",
          adoption_ramp_end: null,
          adoption_confidence: "clear",
          total_ai_commits: 10,
          pre_adoption: metrics({ stabilization_ratio: 0.7 }),
          post_adoption: metrics({ stabilization_ratio: 0.76 }),
        },
      }),
    );

    const stab = summary?.deltas.find((d) => d.key === "stabilization");
    expect(stab?.deltaPp).toBeCloseTo(6, 5);
    expect(stab?.direction).toBe("up");
  });
});
