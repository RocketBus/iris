import { describe, expect, it } from "vitest";

import { computeInvestmentHotspots } from "@/lib/queries/invest-here";
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

describe("computeInvestmentHotspots — fix magnet scaling", () => {
  it("scales code_share_pct/fix_share_pct (0-1 fractions from the engine) to 0-100", () => {
    const out = computeInvestmentHotspots(
      payload({
        fix_target_by_origin: {
          AI_ASSISTED: {
            fixes_attracted: 10,
            code_share_pct: 0.35,
            fix_share_pct: 0.7,
            disproportionality: 2.5,
          },
          HUMAN: {
            fixes_attracted: 0,
            code_share_pct: 0,
            fix_share_pct: 0,
            disproportionality: 0,
          },
          BOT: {
            fixes_attracted: 0,
            code_share_pct: 0,
            fix_share_pct: 0,
            disproportionality: 0,
          },
        },
      }),
    );

    const magnet = out.hotspots.find((h) => h.kind === "fix_magnet");
    expect(magnet).toBeDefined();
    // Not 0.35/0.7 — the engine's field is misleadingly named "_pct" but
    // holds a 0-1 fraction (iris/analysis/fix_targeting.py).
    if (magnet?.kind === "fix_magnet") {
      expect(magnet.codeSharePct).toBe(35);
      expect(magnet.fixSharePct).toBe(70);
    }
  });
});
