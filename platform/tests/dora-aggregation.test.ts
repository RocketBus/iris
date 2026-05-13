import { describe, expect, it } from "vitest";

import { computeDORA } from "@/lib/queries/org-summary";
import type { ReportMetrics } from "@/types/metrics";

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

describe("computeDORA", () => {
  it("returns null when no payload carries dora_source", () => {
    const payloads = new Map<string, ReportMetrics>();
    payloads.set("r1", payload({}));
    payloads.set("r2", payload({}));
    expect(computeDORA(payloads)).toBeNull();
  });

  it("aggregates deploys, failures, and pending across repos", () => {
    const payloads = new Map<string, ReportMetrics>();
    payloads.set(
      "r1",
      payload({
        dora_source: "datadog",
        dora_deployments_total: 30,
        dora_deployments_failed: 3,
        dora_deployments_pending_evaluation: 2,
        dora_incidents_total: 4,
        dora_rollbacks_total: 1,
      }),
    );
    payloads.set(
      "r2",
      payload({
        dora_source: "datadog",
        dora_deployments_total: 10,
        dora_deployments_failed: 1,
        dora_deployments_pending_evaluation: 0,
        dora_incidents_total: 1,
        dora_rollbacks_total: 0,
      }),
    );

    const dora = computeDORA(payloads);
    expect(dora).not.toBeNull();
    if (!dora) return;

    expect(dora.reposWithData).toBe(2);
    expect(dora.deploymentsTotal).toBe(40);
    expect(dora.deploymentsFailed).toBe(4);
    expect(dora.deploymentsPendingEvaluation).toBe(2);
    expect(dora.incidentsTotal).toBe(5);
    expect(dora.rollbacksTotal).toBe(1);

    // CFR: 4 failed / (40 - 2 pending) evaluated = 4/38
    expect(dora.cfr).toBeCloseTo(4 / 38, 5);
    // Rollback rate: 1 / 4
    expect(dora.rollbackRate).toBeCloseTo(0.25, 5);
  });

  it("aggregates CFR-by-origin counts across repos", () => {
    const payloads = new Map<string, ReportMetrics>();
    payloads.set(
      "r1",
      payload({
        dora_source: "datadog",
        dora_deployments_total: 10,
        dora_deployments_failed: 2,
        dora_deployments_pending_evaluation: 0,
        dora_incidents_total: 0,
        dora_cfr_by_origin: {
          AI_ASSISTED: { failed: 2, evaluated: 5, cfr: 0.4, coverage_pct: 100 },
          HUMAN: { failed: 0, evaluated: 5, cfr: 0, coverage_pct: 100 },
        },
      }),
    );
    payloads.set(
      "r2",
      payload({
        dora_source: "datadog",
        dora_deployments_total: 10,
        dora_deployments_failed: 1,
        dora_deployments_pending_evaluation: 0,
        dora_incidents_total: 0,
        dora_cfr_by_origin: {
          AI_ASSISTED: { failed: 0, evaluated: 3, cfr: 0, coverage_pct: 100 },
          HUMAN: { failed: 1, evaluated: 7, cfr: 1 / 7, coverage_pct: 100 },
        },
      }),
    );

    const dora = computeDORA(payloads);
    expect(dora).not.toBeNull();
    if (!dora) return;

    const ai = dora.cfrByOrigin.find((r) => r.origin === "AI_ASSISTED");
    const h = dora.cfrByOrigin.find((r) => r.origin === "HUMAN");
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

  it("skips repos without dora_source even if other dora_* fields slipped through", () => {
    const payloads = new Map<string, ReportMetrics>();
    payloads.set(
      "r1",
      payload({
        dora_source: "datadog",
        dora_deployments_total: 5,
        dora_deployments_failed: 0,
        dora_deployments_pending_evaluation: 0,
        dora_incidents_total: 0,
      }),
    );
    // r2 has stray dora_* without dora_source — must be ignored entirely.
    payloads.set(
      "r2",
      payload({
        dora_deployments_total: 999,
        dora_deployments_failed: 999,
      }),
    );

    const dora = computeDORA(payloads);
    expect(dora).not.toBeNull();
    if (!dora) return;
    expect(dora.reposWithData).toBe(1);
    expect(dora.deploymentsTotal).toBe(5);
  });
});
