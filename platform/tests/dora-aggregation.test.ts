import { describe, expect, it } from "vitest";

import { __testing } from "@/lib/queries/dora";
import type { ReportMetrics } from "@/types/metrics";

const {
  deployDerivedMetrics,
  aggregateCfrByOriginFromPayloads,
  median,
  percentile,
} = __testing;

function deploy(over: {
  id?: string;
  change_failure?: boolean | null;
  recovery_time_sec?: number | null;
  remediation_type?: string | null;
  started_at?: string;
}) {
  // Note: `change_failure` can legitimately be null (tri-state). Use the
  // `in` check rather than `??` so the caller's explicit null isn't
  // coerced to the default `false`.
  return {
    id: over.id ?? "d1",
    change_failure:
      "change_failure" in over ? (over.change_failure ?? null) : false,
    recovery_time_sec: over.recovery_time_sec ?? null,
    remediation_type: over.remediation_type ?? null,
    started_at: over.started_at ?? "2026-04-01T00:00:00Z",
  };
}

function payload(over: Partial<ReportMetrics>): ReportMetrics {
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

describe("deployDerivedMetrics", () => {
  it("excludes pending deploys from the CFR denominator", () => {
    const deployments = [
      ...Array.from({ length: 8 }, (_, i) =>
        deploy({ id: `ok-${i}`, change_failure: false }),
      ),
      deploy({ id: "f1", change_failure: true, recovery_time_sec: 600 }),
      deploy({ id: "f2", change_failure: true, recovery_time_sec: 1200 }),
      deploy({ id: "p1", change_failure: null }),
      deploy({ id: "p2", change_failure: null }),
    ];
    const m = deployDerivedMetrics(deployments, [], 30);
    expect(m.deploymentsTotal).toBe(12);
    expect(m.deploymentsFailed).toBe(2);
    expect(m.deploymentsPendingEvaluation).toBe(2);
    expect(m.cfr).toBe(0.2); // 2 / 10 evaluated
  });

  it("returns null CFR when every deploy is pending", () => {
    const deployments = Array.from({ length: 5 }, (_, i) =>
      deploy({ id: `p-${i}`, change_failure: null }),
    );
    const m = deployDerivedMetrics(deployments, [], 30);
    expect(m.deploymentsPendingEvaluation).toBe(5);
    expect(m.cfr).toBeNull();
  });

  it("computes rollback rate over failed deploys only", () => {
    const deployments = [
      deploy({ id: "f1", change_failure: true, remediation_type: "rollback" }),
      deploy({ id: "f2", change_failure: true, remediation_type: "rollback" }),
      deploy({ id: "f3", change_failure: true, remediation_type: "hotfix" }),
      deploy({ id: "f4", change_failure: true, remediation_type: null }),
    ];
    const m = deployDerivedMetrics(deployments, [], 30);
    expect(m.rollbacksTotal).toBe(2);
    expect(m.rollbackRate).toBe(0.5);
  });

  it("returns null rollback rate when there are no failures", () => {
    const m = deployDerivedMetrics(
      [deploy({ id: "ok-1", change_failure: false })],
      [],
      30,
    );
    expect(m.rollbackRate).toBeNull();
  });

  it("computes deploy frequency over the supplied window", () => {
    const deployments = Array.from({ length: 30 }, (_, i) =>
      deploy({ id: `d-${i}` }),
    );
    const m = deployDerivedMetrics(deployments, [], 10);
    expect(m.deployFrequencyPerDay).toBe(3);
  });

  it("computes median lead time from the commits rows", () => {
    const m = deployDerivedMetrics(
      [deploy({})],
      [
        { change_lead_time: 3600 },
        { change_lead_time: 7200 },
        { change_lead_time: null },
        { change_lead_time: 1800 },
      ],
      30,
    );
    expect(m.leadTimeSecondsMedian).toBe(3600);
  });
});

describe("aggregateCfrByOriginFromPayloads", () => {
  it("returns empty arrays when no payloads carry dora_source=datadog", () => {
    const result = aggregateCfrByOriginFromPayloads(new Map());
    expect(result.cfrByOrigin).toEqual([]);
    expect(result.rollbackRateByOrigin).toEqual([]);
  });

  it("sums per-origin counts across repo payloads and recomputes the rate", () => {
    const payloads = new Map<string, ReportMetrics>();
    payloads.set(
      "r1",
      payload({
        dora_source: "datadog",
        dora_cfr_by_origin: {
          AI_ASSISTED: { failed: 2, evaluated: 5, cfr: 0.4 },
          HUMAN: { failed: 0, evaluated: 5, cfr: 0 },
        },
      }),
    );
    payloads.set(
      "r2",
      payload({
        dora_source: "datadog",
        dora_cfr_by_origin: {
          AI_ASSISTED: { failed: 0, evaluated: 3, cfr: 0 },
          HUMAN: { failed: 1, evaluated: 7, cfr: 1 / 7 },
        },
      }),
    );

    const { cfrByOrigin } = aggregateCfrByOriginFromPayloads(payloads);
    const ai = cfrByOrigin.find((r) => r.origin === "AI_ASSISTED");
    const h = cfrByOrigin.find((r) => r.origin === "HUMAN");
    expect(ai).toEqual({
      origin: "AI_ASSISTED",
      failed: 2,
      evaluated: 8,
      cfr: 2 / 8,
    });
    expect(h).toEqual({
      origin: "HUMAN",
      failed: 1,
      evaluated: 12,
      cfr: 1 / 12,
    });
  });

  it("ignores payloads without dora_source set", () => {
    const payloads = new Map<string, ReportMetrics>();
    payloads.set(
      "r1",
      payload({
        dora_source: "datadog",
        dora_cfr_by_origin: {
          AI_ASSISTED: { failed: 1, evaluated: 2, cfr: 0.5 },
        },
      }),
    );
    payloads.set(
      "r2",
      payload({
        // stray dora_* without dora_source — ignored
        dora_cfr_by_origin: {
          AI_ASSISTED: { failed: 99, evaluated: 99, cfr: 1 },
        },
      }),
    );
    const { cfrByOrigin } = aggregateCfrByOriginFromPayloads(payloads);
    expect(cfrByOrigin).toEqual([
      { origin: "AI_ASSISTED", failed: 1, evaluated: 2, cfr: 0.5 },
    ]);
  });
});

describe("median", () => {
  it("returns null for empty input", () => {
    expect(median([])).toBeNull();
  });

  it("averages the middle two for even-length input", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("picks the middle for odd-length input (after sort)", () => {
    expect(median([1, 5, 3])).toBe(3);
  });
});

describe("percentile — nearest-rank, mirrors iris/analysis/dora_real.py's _percentile", () => {
  it("returns null for empty input", () => {
    expect(percentile([], 0.9)).toBeNull();
  });

  it("returns the single value regardless of q, for a 1-element input", () => {
    expect(percentile([42], 0.9)).toBe(42);
    expect(percentile([42], 0.1)).toBe(42);
  });

  it("matches the Python nearest-rank formula for n=10, p90 (rank 9 of 10)", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    // rank = round(0.9 * 10) = 9 -> 9th smallest (1-indexed) = values[8] = 90
    expect(percentile(values, 0.9)).toBe(90);
  });

  it("never interpolates — always returns an observed value", () => {
    // n=4, q=0.9: rank = round(3.6) = 4 -> the max, not an average of two.
    const values = [1, 2, 3, 100];
    const p90 = percentile(values, 0.9);
    expect(values).toContain(p90);
    expect(p90).toBe(100);
  });

  it("clamps rank to [1, n] so out-of-range q never indexes past the array", () => {
    const values = [5, 15, 25];
    expect(percentile(values, 1.0)).toBe(25); // rank would be exactly n
    expect(percentile(values, 0.01)).toBe(5); // rank rounds down to 0, clamped to 1
  });

  it("sorts unsorted input before ranking", () => {
    const values = [100, 10, 90, 20, 80, 30, 70, 40, 60, 50];
    expect(percentile(values, 0.9)).toBe(90);
  });
});
