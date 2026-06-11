import { describe, expect, it } from "vitest";

import { computeAgentUsage } from "@/lib/queries/agent-usage";
import type { ReportMetrics } from "@/types/metrics";
import type { RepoSummary } from "@/types/temporal";
import type { UsageRollupRow } from "@/types/usage";

function row(
  repositoryId: string,
  model: string,
  opts: Partial<UsageRollupRow> & {
    output_tokens: number;
  },
): UsageRollupRow {
  return {
    organization_id: "org",
    repository_id: repositoryId,
    period_day: "2026-06-10",
    agent: "claude_code",
    model,
    sessions: opts.sessions ?? 1,
    input_tokens: opts.input_tokens ?? 0,
    output_tokens: opts.output_tokens,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    tool_calls: opts.tool_calls ?? 0,
    sidechain_tool_calls: 0,
    duration_buckets: opts.duration_buckets ?? {},
    created_at: "",
    updated_at: "",
  };
}

// computeAgentUsage only reads id/name/stabilization_ratio off RepoSummary.
function repo(id: string, name: string, stab: number | null) {
  return { id, name, stabilization_ratio: stab } as unknown as RepoSummary;
}

function payloadWithAiDurability(survival: number): ReportMetrics {
  return {
    durability_by_origin: { AI_ASSISTED: { survival_rate: survival } },
  } as unknown as ReportMetrics;
}

const SUMMARIES = [
  repo("r-web", "web", 0.9),
  repo("r-tiny", "tiny", 0.5),
  repo("r-ghost", "ghost", null),
];

const PAYLOADS = new Map<string, ReportMetrics>([
  ["r-web", payloadWithAiDurability(0.8)],
]);

// r-web: 5 contributors (visible). r-tiny: 2 (suppressed). r-ghost: unknown (suppressed).
const CONTRIBUTORS = new Map<string, number>([
  ["r-web", 5],
  ["r-tiny", 2],
]);

const USAGE: UsageRollupRow[] = [
  row("r-web", "claude-opus-4-8", {
    output_tokens: 100,
    input_tokens: 150,
    sessions: 2,
    tool_calls: 4,
    duration_buckets: { "15-60m": 2 },
  }),
  row("r-web", "claude-haiku-4-5", {
    output_tokens: 40,
    input_tokens: 50,
    sessions: 1,
    tool_calls: 1,
    duration_buckets: { "5-15m": 1 },
  }),
  row("r-tiny", "claude-haiku-4-5", {
    output_tokens: 30,
    input_tokens: 10,
    sessions: 1,
    tool_calls: 1,
    duration_buckets: { "1-5m": 1 },
  }),
  row("r-ghost", "claude-sonnet-4-6", {
    output_tokens: 5,
    sessions: 1,
    duration_buckets: { "<1m": 1 },
  }),
];

describe("computeAgentUsage", () => {
  it("returns null when there is no usage", () => {
    expect(computeAgentUsage([], SUMMARIES, PAYLOADS, CONTRIBUTORS)).toBeNull();
  });

  it("shows repos with >= k contributors and aggregates per repo", () => {
    const out = computeAgentUsage(USAGE, SUMMARIES, PAYLOADS, CONTRIBUTORS)!;
    expect(out.rows).toHaveLength(1);
    const web = out.rows[0];
    expect(web.repo).toBe("web");
    expect(web.contributors).toBe(5);
    expect(web.outputTokens).toBe(140); // 100 + 40 across models
    expect(web.inputTokens).toBe(200);
    expect(web.sessions).toBe(3);
    expect(web.toolCalls).toBe(5);
    expect(web.topModel).toBe("claude-opus-4-8"); // 100 > 40
    expect(web.durationBuckets).toEqual({ "15-60m": 2, "5-15m": 1 });
  });

  it("cross-references stabilization and AI durability", () => {
    const web = computeAgentUsage(USAGE, SUMMARIES, PAYLOADS, CONTRIBUTORS)!
      .rows[0];
    expect(web.stabilization).toBe(0.9);
    expect(web.durabilityAi).toBe(0.8);
  });

  it("folds sub-k and unknown-contributor repos into the suppressed row", () => {
    const out = computeAgentUsage(USAGE, SUMMARIES, PAYLOADS, CONTRIBUTORS)!;
    expect(out.suppressedRepoCount).toBe(2); // r-tiny + r-ghost
    const sup = out.suppressedRow!;
    expect(sup.suppressed).toBe(true);
    expect(sup.repo).toBeNull();
    expect(sup.repoCount).toBe(2);
    expect(sup.outputTokens).toBe(35); // 30 + 5
    expect(sup.sessions).toBe(2);
    expect(sup.topModel).toBe("claude-haiku-4-5"); // 30 > 5
    expect(sup.durationBuckets).toEqual({ "1-5m": 1, "<1m": 1 });
    // No single durability number for a mix of repos.
    expect(sup.stabilization).toBeNull();
    expect(sup.durabilityAi).toBeNull();
  });

  it("never exposes a sub-k repo name", () => {
    const out = computeAgentUsage(USAGE, SUMMARIES, PAYLOADS, CONTRIBUTORS)!;
    const names = out.rows.map((r) => r.repo);
    expect(names).not.toContain("tiny");
    expect(names).not.toContain("ghost");
  });

  it("computes totals across visible + suppressed", () => {
    const out = computeAgentUsage(USAGE, SUMMARIES, PAYLOADS, CONTRIBUTORS)!;
    expect(out.totals).toEqual({
      sessions: 5,
      inputTokens: 210,
      outputTokens: 175,
      toolCalls: 6,
    });
  });

  it("sorts visible rows by output tokens descending", () => {
    const summaries = [repo("a", "alpha", 0.8), repo("b", "beta", 0.8)];
    const contributors = new Map([
      ["a", 6],
      ["b", 6],
    ]);
    const usage = [
      row("a", "m", { output_tokens: 10 }),
      row("b", "m", { output_tokens: 90 }),
    ];
    const out = computeAgentUsage(usage, summaries, new Map(), contributors)!;
    expect(out.rows.map((r) => r.repo)).toEqual(["beta", "alpha"]);
  });

  it("has no suppressed row when every repo meets the threshold", () => {
    const contributors = new Map([
      ["r-web", 5],
      ["r-tiny", 9],
      ["r-ghost", 9],
    ]);
    const out = computeAgentUsage(USAGE, SUMMARIES, PAYLOADS, contributors)!;
    expect(out.suppressedRow).toBeNull();
    expect(out.suppressedRepoCount).toBe(0);
    expect(out.rows).toHaveLength(3);
  });

  it("respects a custom k threshold", () => {
    // With k=2, r-tiny (2 contributors) becomes visible; r-ghost (unknown) stays suppressed.
    const out = computeAgentUsage(USAGE, SUMMARIES, PAYLOADS, CONTRIBUTORS, 2)!;
    expect(out.rows.map((r) => r.repo).sort()).toEqual(["tiny", "web"]);
    expect(out.suppressedRepoCount).toBe(1); // only r-ghost
  });
});
