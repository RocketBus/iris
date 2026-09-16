import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  aggregateAuthors,
  buildIdentityCandidates,
  buildUsageTrend,
  getPersonalAIUsage,
  matchUserAuthors,
  type MatchedAuthor,
  type MetricRow,
} from "@/lib/queries/personal-ai-usage";
import type { ReportMetrics } from "@/types/metrics";

const ACCOUNT = { name: "Dev", email: "dev@example.com" };
const CANDIDATES = buildIdentityCandidates(ACCOUNT);

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

function authorsOf(authors: AuthorInput[]) {
  return payloadWith(authors).author_velocity!.authors;
}

function matchesFor(
  authors: AuthorInput[],
  account: { name: string | null; email: string | null } = ACCOUNT,
) {
  return matchUserAuthors(
    payloadWith(authors),
    buildIdentityCandidates(account),
  );
}

function matchOf(
  author: AuthorInput,
  matchedBy: "email" | "name" = "email",
): MatchedAuthor {
  return { author: authorsOf([author])[0], matchedBy };
}

async function usageFor(
  authors: AuthorInput[],
  account: { name: string | null; email: string | null } = ACCOUNT,
) {
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

  return getPersonalAIUsage(supabase, account, ORGS);
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

    const trend = buildUsageTrend(rowsPerRepo, CANDIDATES);

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

    const trend = buildUsageTrend(rowsPerRepo, CANDIDATES);

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

    const trend = buildUsageTrend(rowsPerRepo, CANDIDATES);

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

    const trend = buildUsageTrend(rowsPerRepo, CANDIDATES);

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

    const trend = buildUsageTrend(rowsPerRepo, CANDIDATES);

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

    const trend = buildUsageTrend(rowsPerRepo, CANDIDATES);

    expect(trend).toHaveLength(1);
    expect(trend[0].aiCommitPct).toBeCloseTo(100);
  });
});

describe("buildIdentityCandidates", () => {
  it("splits the account email into an exact tier and a weaker local-part tier", () => {
    const candidates = buildIdentityCandidates({
      name: "Dev Real Name",
      email: "dev@example.com",
    });

    expect([...candidates.emails]).toEqual(["dev@example.com"]);
    expect([...candidates.names]).toEqual(["dev real name"]);
    expect([...candidates.emailLocalParts]).toEqual(["dev"]);
  });

  it("normalizes case and surrounding whitespace on every tier", () => {
    const candidates = buildIdentityCandidates({
      name: "  Dev Real Name  ",
      email: "  DEV@Example.COM  ",
    });

    expect(candidates.emails.has("dev@example.com")).toBe(true);
    expect(candidates.names.has("dev real name")).toBe(true);
    expect(candidates.emailLocalParts.has("dev")).toBe(true);
  });

  it("omits the local-part tier for an account with no email", () => {
    const candidates = buildIdentityCandidates({ name: "Dev", email: null });

    expect(candidates.emails.size).toBe(0);
    expect(candidates.emailLocalParts.size).toBe(0);
    expect([...candidates.names]).toEqual(["dev"]);
  });

  it("derives no local part from an email with an empty local part", () => {
    const candidates = buildIdentityCandidates({
      name: null,
      email: "@example.com",
    });

    expect(candidates.emailLocalParts.size).toBe(0);
  });

  it("yields three empty tiers for an account with neither name nor email", () => {
    const candidates = buildIdentityCandidates({ name: null, email: null });

    expect(candidates.emails.size).toBe(0);
    expect(candidates.names.size).toBe(0);
    expect(candidates.emailLocalParts.size).toBe(0);
  });
});

describe("matchUserAuthors identity tiers", () => {
  it("matches on email whatever display name the author committed under", () => {
    const matches = matchesFor([
      { name: "codermarcos", email: "dev@example.com", total_commits: 12 },
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0].matchedBy).toBe("email");
  });

  it("matches emails case-insensitively and ignoring whitespace", () => {
    const matches = matchesFor([
      { name: "Someone Else", email: "  DEV@Example.COM ", total_commits: 3 },
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0].matchedBy).toBe("email");
  });

  it("keeps an author with no email out of the email tier", () => {
    const matches = matchesFor([{ name: "Dev", total_commits: 5 }]);

    expect(matches).toHaveLength(1);
    expect(matches[0].matchedBy).toBe("name");
  });

  it("collects the second identity by name alongside the email match (issue #193)", () => {
    const matches = matchesFor([
      { name: "Dev", email: "dev@company.example", total_commits: 183 },
      { name: "Dev", email: "dev@example.com", total_commits: 1 },
    ]);

    expect(matches).toHaveLength(2);
    expect(matches.map((entry) => entry.matchedBy)).toEqual(["name", "email"]);
  });

  it("counts an author once when it satisfies more than one tier", () => {
    // The account name and the account email local part are both "dev" here,
    // and the row also carries the account email — three ways in, one row out.
    const matches = matchesFor([
      { name: "Dev", email: "dev@example.com", total_commits: 9 },
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0].matchedBy).toBe("email");
  });

  it("absorbs a namesake sharing the display name — the deliberate cost of the name tier", () => {
    // Issue #193 forces this: the account carries a single email, so a user's
    // second git identity is only ever recoverable by display name, and a real
    // namesake is indistinguishable from it. The row is reported as a "name"
    // match so the UI can warn. This test pins the trade-off rather than
    // pretending it does not exist — when the account starts carrying every
    // verified git email, the expectation here should flip to one match.
    const matches = matchesFor([
      { name: "Dev", email: "dev@example.com", total_commits: 40 },
      {
        name: "Dev",
        email: "a-different-person@example.com",
        total_commits: 900,
      },
    ]);

    expect(matches).toHaveLength(2);
    expect(matches[1].matchedBy).toBe("name");
  });

  it("ignores the email local part once any row matched on email", () => {
    // "dev" as a git user.name is a coin flip between the account holder and a
    // deploy bot. With the account email already anchoring this repo, the guess
    // buys nothing and can only over-attribute.
    const matches = matchesFor(
      [
        { name: "Dev Real Name", email: "dev@example.com", total_commits: 20 },
        { name: "dev", email: "ci-bot@example.com", total_commits: 5000 },
      ],
      { name: "Dev Real Name", email: "dev@example.com" },
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].author.email).toBe("dev@example.com");
  });

  it("ignores the email local part once a display name anchored the user", () => {
    // An email anchor is not the only kind. A display-name hit already proves
    // the user is present in this repo, so the weakest tier has nothing left
    // to contribute and can only pull the bot in.
    const matches = matchesFor(
      [
        {
          name: "Dev Real Name",
          email: "personal@example.com",
          total_commits: 20,
        },
        { name: "dev", email: "ci-bot@example.com", total_commits: 5000 },
      ],
      { name: "Dev Real Name", email: "dev@example.com" },
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].author.email).toBe("personal@example.com");
    expect(matches[0].matchedBy).toBe("name");
  });

  it("runs the email local part only when no other tier placed the user", () => {
    // The strict reading of "last resort": the tier is reachable only from an
    // otherwise empty match set.
    const anchored = matchesFor(
      [
        { name: "Dev Real Name", total_commits: 1 },
        { name: "dev", total_commits: 5000 },
      ],
      { name: "Dev Real Name", email: "dev@example.com" },
    );
    const unanchored = matchesFor([{ name: "dev", total_commits: 5000 }], {
      name: "Dev Real Name",
      email: "dev@example.com",
    });

    expect(anchored).toHaveLength(1);
    expect(anchored[0].author.name).toBe("Dev Real Name");
    expect(unanchored).toHaveLength(1);
    expect(unanchored[0].author.name).toBe("dev");
  });

  it("still matches the email local part when no row matched on email", () => {
    // Without an anchor the guess is the difference between a fallback and an
    // empty page, which is the case it was added for.
    const matches = matchesFor(
      [{ name: "dev", email: "legacy@example.com", total_commits: 30 }],
      { name: "Dev Real Name", email: "dev@example.com" },
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].matchedBy).toBe("name");
  });

  it("reports a local-part match as a name match, never as an email match", () => {
    const matches = matchesFor([{ name: "dev", total_commits: 30 }], {
      name: "Dev Real Name",
      email: "dev@example.com",
    });

    expect(matches[0].matchedBy).toBe("name");
  });

  it("returns nothing for a null payload", () => {
    expect(matchUserAuthors(null, CANDIDATES)).toEqual([]);
  });

  it("returns nothing when the payload carries no author velocity", () => {
    expect(matchUserAuthors({} as ReportMetrics, CANDIDATES)).toEqual([]);
  });

  it("returns nothing when no tier matches any author", () => {
    expect(
      matchesFor([{ name: "Other Dev", email: "other@example.com" }]),
    ).toEqual([]);
  });
});

describe("aggregateAuthors weighting", () => {
  it("returns null for an empty match list", () => {
    expect(aggregateAuthors([])).toBeNull();
  });

  it("reproduces a lone identity's share exactly when it has no commit count", () => {
    const usage = aggregateAuthors([
      matchOf({ name: "Dev", ai_commit_pct: 40 }),
    ]);

    expect(usage!.aiCommitPct).toBeCloseTo(40, 10);
    expect(usage!.totalCommits).toBe(0);
  });

  it("collapses several uncounted identities to the plain mean", () => {
    const usage = aggregateAuthors([
      matchOf({ name: "Dev", ai_commit_pct: 40 }),
      matchOf({ name: "Dev", ai_commit_pct: 60 }, "name"),
    ]);

    expect(usage!.aiCommitPct).toBeCloseTo(50, 10);
  });

  it("never yields NaN when every identity reports zero commits", () => {
    // The floor of 1 per identity is what keeps the denominator alive here.
    // A bare weighted mean would divide 0 by 0 and render "NaN%" to the user.
    const usage = aggregateAuthors([
      matchOf({ name: "Dev", total_commits: 0, ai_commit_pct: 40 }),
      matchOf({ name: "Dev", total_commits: 0, ai_commit_pct: 60 }, "name"),
    ]);

    expect(Number.isFinite(usage!.aiCommitPct)).toBe(true);
    expect(usage!.aiCommitPct).toBeCloseTo(50, 10);
    expect(usage!.totalCommits).toBe(0);
  });

  it("mixes counted and uncounted identities without losing the counted one", () => {
    const usage = aggregateAuthors([
      matchOf({ name: "Dev", total_commits: 99, ai_commit_pct: 100 }),
      matchOf({ name: "Dev", ai_commit_pct: 0 }, "name"),
    ]);

    // The uncounted identity weighs 1 against 99, not 50/50.
    expect(usage!.aiCommitPct).toBeCloseTo(99, 10);
    expect(usage!.totalCommits).toBe(99);
  });

  it("keeps totalCommits as the reported sum, not the floored weights", () => {
    const usage = aggregateAuthors([
      matchOf({ name: "Dev", ai_commit_pct: 10 }),
      matchOf({ name: "Dev", ai_commit_pct: 20 }, "name"),
      matchOf({ name: "Dev", ai_commit_pct: 30 }, "name"),
    ]);

    expect(usage!.totalCommits).toBe(0);
  });

  it("takes the maximum high-velocity weeks and degrades matchedBy to name", () => {
    const usage = aggregateAuthors([
      matchOf({ name: "Dev", total_commits: 10, high_velocity_weeks: 3 }),
      matchOf(
        { name: "Dev", total_commits: 5, high_velocity_weeks: 2 },
        "name",
      ),
    ]);

    expect(usage!.highVelocityWeeks).toBe(3);
    expect(usage!.matchedBy).toBe("name");
  });

  it("records a missing author email as null in the identity list", () => {
    const usage = aggregateAuthors([matchOf({ name: "Dev" }, "name")]);

    expect(usage!.identities).toEqual([{ name: "Dev", email: null }]);
  });
});

describe("trend and table agree on identity", () => {
  it("excludes from the trend the same local-part identity the table excludes", () => {
    // A divergence here would be the worst kind of bug on this page: a chart
    // that disagrees with the row printed right above it.
    const authors: AuthorInput[] = [
      {
        name: "Dev Real Name",
        email: "dev@example.com",
        total_commits: 10,
        ai_commit_pct: 100,
        weekly: [{ week_start: "2026-07-27", commits: 10, ai_commits: 10 }],
      },
      {
        name: "dev",
        email: "ci-bot@example.com",
        total_commits: 90,
        ai_commit_pct: 0,
        weekly: [{ week_start: "2026-07-27", commits: 90, ai_commits: 0 }],
      },
    ];
    const account = { name: "Dev Real Name", email: "dev@example.com" };

    const trend = buildUsageTrend(
      new Map([["repo-1", [multiIdentityRow(authors)]]]),
      buildIdentityCandidates(account),
    );

    expect(trend).toHaveLength(1);
    expect(trend[0].aiCommitPct).toBeCloseTo(100);
  });

  it("keeps the table and the trend on the same identities end to end", async () => {
    const usage = await usageFor(
      [
        {
          name: "Dev Real Name",
          email: "dev@example.com",
          total_commits: 10,
          ai_commit_pct: 100,
          weekly: [{ week_start: "2026-07-27", commits: 10, ai_commits: 10 }],
        },
        {
          name: "dev",
          email: "ci-bot@example.com",
          total_commits: 90,
          ai_commit_pct: 0,
          weekly: [{ week_start: "2026-07-27", commits: 90, ai_commits: 0 }],
        },
      ],
      { name: "Dev Real Name", email: "dev@example.com" },
    );

    expect(usage.perRepo[0].totalCommits).toBe(10);
    expect(usage.perRepo[0].aiCommitPct).toBeCloseTo(100);
    expect(usage.perRepo[0].matchedBy).toBe("email");
    expect(usage.trend[0].aiCommitPct).toBeCloseTo(100);
  });
});
