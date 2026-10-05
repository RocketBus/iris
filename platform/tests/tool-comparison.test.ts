import { describe, expect, it } from "vitest";

import { computeToolComparison } from "@/lib/queries/tool-comparison";
import type { ReportMetrics } from "@/types/metrics";

const payload = (acceptance: Record<string, unknown>) =>
  ({
    acceptance_by_tool: acceptance,
  }) as unknown as ReportMetrics;

describe("computeToolComparison — acceptance groups without review metrics", () => {
  it("does not turn a missing single_pass_rate into NaN, and matches a run without that group", () => {
    const full = {
      total_commits: 50,
      commits_in_prs: 50,
      pr_rate: 1,
      single_pass_rate: 0.6,
      median_review_rounds: 1,
    };
    const degraded = { total_commits: 50, commits_in_prs: 50, pr_rate: 1 };

    const withDegraded = computeToolComparison(
      new Map([
        ["r1", payload({ claude: full })],
        ["r2", payload({ claude: degraded })],
      ]),
    );
    const without = computeToolComparison(
      new Map([["r1", payload({ claude: full })]]),
    );

    const a = withDegraded!.rows[0];
    const b = without!.rows[0];
    expect(a.singlePassRate).toBe(0.6);
    expect(Number.isNaN(a.singlePassRate)).toBe(false);
    expect(a.singlePassRate).toBe(b.singlePassRate);
  });
});
