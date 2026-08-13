import { describe, expect, it } from "vitest";

import { detectChanges, PP_STABLE } from "@/lib/queries/temporal";
import type { TimeSeriesPoint } from "@/types/temporal";

function point(over: Partial<TimeSeriesPoint>): TimeSeriesPoint {
  return {
    date: "2026-01-01",
    stabilization_ratio: null,
    revert_rate: null,
    churn_events: null,
    commits_total: null,
    ai_detection_coverage_pct: null,
    ...over,
  };
}

describe("detectChanges — thresholds match the engine's canonical PP_STABLE", () => {
  it("flags a 6pp stabilization drop (was silent below the old 10pp threshold)", () => {
    const current = point({ stabilization_ratio: 0.7 });
    const previous = point({ stabilization_ratio: 0.76 });
    const changes = detectChanges("repo", "id", current, previous);
    expect(changes.some((c) => c.metric === "stabilization_ratio")).toBe(true);
  });

  it("stays silent on a stabilization move smaller than PP_STABLE", () => {
    const current = point({ stabilization_ratio: 0.71 });
    const previous = point({ stabilization_ratio: 0.73 });
    const changes = detectChanges("repo", "id", current, previous);
    expect(changes.some((c) => c.metric === "stabilization_ratio")).toBe(false);
  });

  it("flags a 6pp AI-coverage change (was silent below the old 15pp threshold)", () => {
    const current = point({ ai_detection_coverage_pct: 20 });
    const previous = point({ ai_detection_coverage_pct: 14 });
    const changes = detectChanges("repo", "id", current, previous);
    expect(changes.some((c) => c.metric === "ai_detection_coverage_pct")).toBe(
      true,
    );
  });

  it("uses the same PP_STABLE floor for revert_rate as before (5pp already matched)", () => {
    const atThreshold = detectChanges(
      "repo",
      "id",
      point({ revert_rate: 0.1 }),
      point({ revert_rate: 0.1 - PP_STABLE / 100 }),
    );
    expect(atThreshold.some((c) => c.metric === "revert_rate")).toBe(true);

    const belowThreshold = detectChanges(
      "repo",
      "id",
      point({ revert_rate: 0.1 }),
      point({ revert_rate: 0.1 - PP_STABLE / 100 + 0.01 }),
    );
    expect(belowThreshold.some((c) => c.metric === "revert_rate")).toBe(false);
  });
});
