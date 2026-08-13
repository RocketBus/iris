import { describe, expect, it } from "vitest";

import {
  buildUsageTrend,
  type MetricRow,
} from "@/lib/queries/personal-ai-usage";
import type { ReportMetrics } from "@/types/metrics";

const EMAIL = new Set(["dev@example.com"]);
const NAME = new Set<string>();

function row(
  createdAt: string,
  weekly: Array<{ week_start: string; commits: number; ai_commits?: number }>,
): MetricRow {
  const payload: ReportMetrics = {
    commits_total: 0,
    commits_revert: 0,
    revert_rate: 0,
    churn_events: 0,
    churn_lines_affected: 0,
    files_touched: 0,
    files_stabilized: 0,
    stabilization_ratio: 0,
    author_velocity: {
      authors: [
        {
          name: "Dev",
          email: "dev@example.com",
          high_velocity_weeks: 0,
          ai_commit_pct: 0,
          weekly: weekly.map((w) => ({
            week_start: w.week_start,
            commits: w.commits,
            lines_added: 0,
            lines_removed: 0,
            ai_commits: w.ai_commits,
          })),
        },
      ],
    },
  } as ReportMetrics;

  return {
    repository_id: "repo-1",
    payload,
    created_at: createdAt,
    organization_id: "org-1",
  };
}

describe("buildUsageTrend", () => {
  it("merges weeks across multiple historical rows for the same repo", () => {
    // Two non-overlapping pushes, each covering its own analysis window —
    // this is exactly what a single-latest-row trend would miss.
    const rowsPerRepo = new Map<string, MetricRow[]>([
      [
        "repo-1",
        [
          row("2026-08-01T00:00:00Z", [
            { week_start: "2026-07-27", commits: 10, ai_commits: 4 },
          ]),
          row("2026-06-01T00:00:00Z", [
            { week_start: "2026-05-25", commits: 8, ai_commits: 2 },
          ]),
        ],
      ],
    ]);

    const trend = buildUsageTrend(rowsPerRepo, EMAIL, NAME);

    expect(trend.map((t) => t.date)).toEqual(["2026-05-25", "2026-07-27"]);
    expect(trend[0].aiCommitPct).toBeCloseTo(25);
    expect(trend[1].aiCommitPct).toBeCloseTo(40);
  });

  it("prefers the newest push's value when overlapping pushes report the same week", () => {
    const rowsPerRepo = new Map<string, MetricRow[]>([
      [
        "repo-1",
        [
          // Newest first (as the DESC-ordered query returns them).
          row("2026-08-01T00:00:00Z", [
            { week_start: "2026-07-27", commits: 10, ai_commits: 9 },
          ]),
          row("2026-07-15T00:00:00Z", [
            { week_start: "2026-07-27", commits: 3, ai_commits: 0 },
          ]),
        ],
      ],
    ]);

    const trend = buildUsageTrend(rowsPerRepo, EMAIL, NAME);

    expect(trend).toHaveLength(1);
    expect(trend[0].aiCommitPct).toBeCloseTo(90);
  });

  it("merges weeks across different repos into the same bucket", () => {
    const rowsPerRepo = new Map<string, MetricRow[]>([
      [
        "repo-1",
        [
          row("2026-08-01T00:00:00Z", [
            { week_start: "2026-07-27", commits: 10, ai_commits: 5 },
          ]),
        ],
      ],
      [
        "repo-2",
        [
          row("2026-08-01T00:00:00Z", [
            { week_start: "2026-07-27", commits: 10, ai_commits: 5 },
          ]),
        ],
      ],
    ]);

    const trend = buildUsageTrend(rowsPerRepo, EMAIL, NAME);

    expect(trend).toHaveLength(1);
    expect(trend[0].repos).toBe(2);
    expect(trend[0].aiCommitPct).toBeCloseTo(50);
  });

  it("returns null aiCommitPct for weeks with commit counts but no AI data", () => {
    const rowsPerRepo = new Map<string, MetricRow[]>([
      [
        "repo-1",
        [
          row("2026-08-01T00:00:00Z", [
            { week_start: "2026-07-27", commits: 10 },
          ]),
        ],
      ],
    ]);

    const trend = buildUsageTrend(rowsPerRepo, EMAIL, NAME);

    expect(trend[0].aiCommitPct).toBeNull();
  });
});
