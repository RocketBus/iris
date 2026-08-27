import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  buildUsageTrend,
  getPersonalAIUsage,
  type MetricRow,
} from "@/lib/queries/personal-ai-usage";
import type { ReportMetrics } from "@/types/metrics";

const EMAIL = new Set(["dev@example.com"]);
const NAME = new Set<string>();

interface AuthorInput {
  name: string;
  email?: string;
  total_commits?: number;
  high_velocity_weeks?: number;
  ai_commit_pct?: number;
  weekly?: Array<{ week_start: string; commits: number; ai_commits?: number }>;
}

function payloadWith(authors: AuthorInput[]): ReportMetrics {
  return {
    commits_total: 0,
    commits_revert: 0,
    revert_rate: 0,
    churn_events: 0,
    churn_lines_affected: 0,
    files_touched: 0,
    files_stabilized: 0,
    stabilization_ratio: 0,
    author_velocity: {
      authors: authors.map((a) => ({
        name: a.name,
        email: a.email,
        total_commits: a.total_commits,
        high_velocity_weeks: a.high_velocity_weeks ?? 0,
        ai_commit_pct: a.ai_commit_pct ?? 0,
        weekly: (a.weekly ?? []).map((w) => ({
          week_start: w.week_start,
          commits: w.commits,
          lines_added: 0,
          lines_removed: 0,
          ai_commits: w.ai_commits,
        })),
      })),
    },
  } as ReportMetrics;
}

function row(
  createdAt: string,
  weekly: Array<{ week_start: string; commits: number; ai_commits?: number }>,
): MetricRow {
  return {
    repository_id: "repo-1",
    payload: payloadWith([{ name: "Dev", email: "dev@example.com", weekly }]),
    created_at: createdAt,
    organization_id: "org-1",
  };
}

function multiIdentityRow(
  authors: AuthorInput[],
  createdAt = "2026-08-01T00:00:00Z",
): MetricRow {
  return {
    repository_id: "repo-1",
    payload: payloadWith(authors),
    created_at: createdAt,
    organization_id: "org-1",
  };
}

function fakeSupabase(tables: Record<string, unknown[]>): SupabaseClient {
  return {
    from(table: string) {
      const result = { data: tables[table] ?? [] };
      const chain = {
        select: () => chain,
        in: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(result).then(resolve),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

const ORGS = [{ id: "org-1", slug: "acme", name: "Acme" }];

async function usageFor(authors: AuthorInput[]) {
  const supabase = fakeSupabase({
    repositories: [{ id: "repo-1", name: "repo-a", organization_id: "org-1" }],
    metrics: [
      {
        repository_id: "repo-1",
        payload: payloadWith(authors),
        created_at: "2026-08-01T00:00:00Z",
        organization_id: "org-1",
      },
    ],
  });

  return getPersonalAIUsage(
    supabase,
    { name: "Dev", email: "dev@example.com" },
    ORGS,
  );
}

describe("getPersonalAIUsage identity aggregation", () => {
  it("consolidates a secondary email identity with the primary name-matched one", async () => {
    // The reported bug (#193): the account email covers only the GitHub web-UI
    // identity, which contributed one non-merge commit with no AI attribution,
    // while the real work sits under a different git email.
    const usage = await usageFor([
      {
        name: "Dev",
        email: "dev@company.example",
        total_commits: 183,
        ai_commit_pct: 99.5,
        high_velocity_weeks: 4,
      },
      {
        name: "Dev",
        email: "dev@example.com",
        total_commits: 1,
        ai_commit_pct: 0,
        high_velocity_weeks: 0,
      },
    ]);

    expect(usage.perRepo).toHaveLength(1);
    expect(usage.perRepo[0].totalCommits).toBe(184);
    expect(usage.perRepo[0].aiCommitPct).toBeCloseTo(98.96, 1);
    expect(usage.perRepo[0].matchedIdentities).toHaveLength(2);
  });

  it("weights the AI share by commits so a one-commit identity cannot drag it down", async () => {
    const usage = await usageFor([
      { name: "Dev", total_commits: 99, ai_commit_pct: 100 },
      {
        name: "Dev",
        email: "dev@example.com",
        total_commits: 1,
        ai_commit_pct: 0,
      },
    ]);

    // A plain mean would report 50%.
    expect(usage.perRepo[0].aiCommitPct).toBeCloseTo(99, 5);
  });

  it("takes the maximum high-velocity weeks rather than the sum", async () => {
    const usage = await usageFor([
      { name: "Dev", total_commits: 10, high_velocity_weeks: 3 },
      {
        name: "Dev",
        email: "dev@example.com",
        total_commits: 5,
        high_velocity_weeks: 2,
      },
    ]);

    expect(usage.perRepo[0].highVelocityWeeks).toBe(3);
    expect(usage.maxHighVelocityWeeks).toBe(3);
  });

  it("degrades the match to name when any identity matched on name alone", async () => {
    const usage = await usageFor([
      { name: "Dev", total_commits: 183, ai_commit_pct: 99.5 },
      { name: "Dev", email: "dev@example.com", total_commits: 1 },
    ]);

    expect(usage.perRepo[0].matchedBy).toBe("name");
  });

  it("keeps the match at email when every identity matched on email", async () => {
    const usage = await usageFor([
      { name: "Someone Else", email: "dev@example.com", total_commits: 12 },
    ]);

    expect(usage.perRepo[0].matchedBy).toBe("email");
    expect(usage.perRepo[0].matchedIdentities).toHaveLength(1);
  });

  it("excludes authors that match neither the email nor the name", async () => {
    const usage = await usageFor([
      { name: "Other Dev", email: "other@example.com", total_commits: 500 },
      { name: "Dev", email: "dev@example.com", total_commits: 7 },
    ]);

    expect(usage.perRepo[0].totalCommits).toBe(7);
    expect(usage.perRepo[0].matchedIdentities).toHaveLength(1);
  });

  it("falls back to the plain mean when payloads carry no commit counts", async () => {
    const usage = await usageFor([
      { name: "Dev", email: "dev@example.com", ai_commit_pct: 40 },
    ]);

    expect(usage.perRepo[0].totalCommits).toBe(0);
    expect(usage.perRepo[0].aiCommitPct).toBeCloseTo(40, 5);
  });

  it("reports no match when the user owns none of the author rows", async () => {
    const usage = await usageFor([
      { name: "Other Dev", email: "other@example.com", total_commits: 500 },
    ]);

    expect(usage.matched).toBe(false);
    expect(usage.perRepo).toHaveLength(0);
  });
});

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

  it("sums both identities when one week is split across them in the same push", () => {
    const rowsPerRepo = new Map<string, MetricRow[]>([
      [
        "repo-1",
        [
          multiIdentityRow([
            {
              name: "Dev",
              email: "dev@company.example",
              weekly: [
                { week_start: "2026-07-27", commits: 18, ai_commits: 18 },
              ],
            },
            {
              name: "Dev",
              email: "dev@example.com",
              weekly: [{ week_start: "2026-07-27", commits: 2, ai_commits: 0 }],
            },
          ]),
        ],
      ],
    ]);

    const trend = buildUsageTrend(rowsPerRepo, EMAIL, new Set(["dev"]));

    expect(trend).toHaveLength(1);
    expect(trend[0].aiCommitPct).toBeCloseTo(90);
  });

  it("does not let a second identity re-open a week already taken from a newer push", () => {
    const rowsPerRepo = new Map<string, MetricRow[]>([
      [
        "repo-1",
        [
          multiIdentityRow(
            [
              {
                name: "Dev",
                email: "dev@example.com",
                weekly: [
                  { week_start: "2026-07-27", commits: 10, ai_commits: 10 },
                ],
              },
            ],
            "2026-08-01T00:00:00Z",
          ),
          multiIdentityRow(
            [
              {
                name: "Dev",
                email: "dev@company.example",
                weekly: [
                  { week_start: "2026-07-27", commits: 90, ai_commits: 0 },
                ],
              },
            ],
            "2026-07-01T00:00:00Z",
          ),
        ],
      ],
    ]);

    const trend = buildUsageTrend(rowsPerRepo, EMAIL, new Set(["dev"]));

    expect(trend).toHaveLength(1);
    expect(trend[0].aiCommitPct).toBeCloseTo(100);
  });
});
