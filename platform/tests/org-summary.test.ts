import { describe, expect, it } from "vitest";

import {
  computeAIvsHuman,
  computeDeliveryQuality,
  computeHyperEngineers,
  computeOrgPulse,
  computePreviousTotals,
  computePRHealth,
  isHyperEngineer,
} from "@/lib/queries/org-summary";
import type { ReportMetrics } from "@/types/metrics";
import type { RepoSummary } from "@/types/temporal";

function repo(over: Partial<RepoSummary>): RepoSummary {
  return {
    id: "r1",
    name: "r1",
    remote_url: null,
    last_run_at: "2026-08-01T00:00:00Z",
    runs_count: 1,
    stabilization_ratio: null,
    revert_rate: null,
    churn_events: null,
    commits_total: 0,
    ai_detection_coverage_pct: null,
    pr_merged_count: null,
    pr_single_pass_rate: null,
    fix_latency_median_hours: null,
    cascade_rate: null,
    merge_strategy: null,
    commit_metrics_reliable: null,
    stabilization_delta: null,
    health: "unknown",
    sparkline: [],
    ...over,
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

describe("computeOrgPulse — AI adoption", () => {
  it("includes repos with a legitimate 0% AI coverage in the weighted average", () => {
    const repos = [
      repo({ id: "r1", commits_total: 900, ai_detection_coverage_pct: 0 }),
      repo({ id: "r2", commits_total: 100, ai_detection_coverage_pct: 50 }),
    ];
    const out = computeOrgPulse(repos, new Map(), 0);
    // (0*900 + 50*100) / 1000 = 5 — not 50, which is what you'd get if the
    // 900-commit 0%-AI repo were dropped from the average entirely.
    expect(out.aiAdoptionPct).toBeCloseTo(5, 5);
  });

  it("excludes repos with no AI data at all (null) from the average", () => {
    const repos = [
      repo({ id: "r1", commits_total: 900, ai_detection_coverage_pct: null }),
      repo({ id: "r2", commits_total: 100, ai_detection_coverage_pct: 50 }),
    ];
    const out = computeOrgPulse(repos, new Map(), 0);
    expect(out.aiAdoptionPct).toBeCloseTo(50, 5);
  });
});

describe("computePreviousTotals — AI delta baseline", () => {
  it("weights the previous-period AI value by commits, including legitimate 0%s", () => {
    const repos = [repo({ id: "r1" }), repo({ id: "r2" })];
    const allMetrics = [
      // newest row first, then the previous row, per repo
      {
        repository_id: "r1",
        commits_total: 950,
        pr_merged_count: 0,
        ai_detection_coverage_pct: 5,
      },
      {
        repository_id: "r1",
        commits_total: 900,
        pr_merged_count: 0,
        ai_detection_coverage_pct: 0,
      },
      {
        repository_id: "r2",
        commits_total: 110,
        pr_merged_count: 0,
        ai_detection_coverage_pct: 55,
      },
      {
        repository_id: "r2",
        commits_total: 100,
        pr_merged_count: 0,
        ai_detection_coverage_pct: 50,
      },
    ];

    const out = computePreviousTotals(repos, allMetrics);
    // Weighted: (0*900 + 50*100) / 1000 = 5 — not a plain average of
    // [0, 50] (25), and not skipping the 0% row.
    expect(out.aiPct).toBeCloseTo(5, 5);
  });
});

describe("computeAIvsHuman — attribution gap", () => {
  it("uses org-wide human commit count as the denominator, not just repos that reported a gap", () => {
    const payloads = new Map<string, ReportMetrics>();
    // Flags a gap (engine only emits attribution_gap once >=3 commits are
    // flagged), but the repo's own human-commit count is tiny.
    payloads.set(
      "r1",
      payload({
        ai_detection_coverage_pct: 10,
        commit_origin_distribution: { HUMAN: 4500, AI_ASSISTED: 500, BOT: 0 },
        attribution_gap: {
          flagged_commits: 3,
          total_human_commits: 10,
          flagged_pct: 30,
          avg_loc: 0,
          avg_files: 0,
          avg_interval_minutes: 0,
        },
      }),
    );
    // Clean repo — under the engine's MIN_FLAGGED_TO_REPORT=3 guard, so it
    // never carries an attribution_gap field, but its human commits are
    // real and must still count toward the org-wide denominator.
    payloads.set(
      "r2",
      payload({
        ai_detection_coverage_pct: 10,
        commit_origin_distribution: { HUMAN: 4500, AI_ASSISTED: 500, BOT: 0 },
      }),
    );

    const out = computeAIvsHuman(payloads);
    expect(out).not.toBeNull();
    // 3 flagged / 9000 total human commits org-wide ≈ 0.033% — not
    // 3/10 = 30%, which is what you get using only r1's own (tiny) count.
    expect(out!.attributionGap!.totalHumanCommits).toBe(9000);
    expect(out!.attributionGap!.flaggedPct).toBeCloseTo((3 / 9000) * 100, 5);
  });
});

describe("computePRHealth — by-origin weighting", () => {
  it("weights human/AI single-pass rate and review rounds by commits_in_prs, not by repo count", () => {
    const repos = [
      repo({ id: "r1", pr_merged_count: 50 }),
      repo({ id: "r2", pr_merged_count: 5 }),
    ];
    const payloads = new Map<string, ReportMetrics>();
    payloads.set(
      "r1",
      payload({
        pr_merged_count: 50,
        acceptance_by_origin: {
          HUMAN: {
            total_commits: 100,
            commits_in_prs: 100,
            pr_rate: 1,
            single_pass_rate: 0.9,
            median_review_rounds: 1,
          },
          AI_ASSISTED: {
            total_commits: 0,
            commits_in_prs: 0,
            pr_rate: 0,
            single_pass_rate: 0,
            median_review_rounds: 0,
          },
          BOT: {
            total_commits: 0,
            commits_in_prs: 0,
            pr_rate: 0,
            single_pass_rate: 0,
            median_review_rounds: 0,
          },
        },
      }),
    );
    payloads.set(
      "r2",
      payload({
        pr_merged_count: 5,
        acceptance_by_origin: {
          HUMAN: {
            total_commits: 10,
            commits_in_prs: 10,
            pr_rate: 1,
            single_pass_rate: 0.1,
            median_review_rounds: 5,
          },
          AI_ASSISTED: {
            total_commits: 0,
            commits_in_prs: 0,
            pr_rate: 0,
            single_pass_rate: 0,
            median_review_rounds: 0,
          },
          BOT: {
            total_commits: 0,
            commits_in_prs: 0,
            pr_rate: 0,
            single_pass_rate: 0,
            median_review_rounds: 0,
          },
        },
      }),
    );

    const out = computePRHealth(repos, payloads);
    expect(out).not.toBeNull();
    // Weighted: (0.9*100 + 0.1*10) / 110 ≈ 0.827 — not the plain per-repo
    // average of [0.9, 0.1], which would be 0.5.
    expect(out!.byOrigin.human!.singlePassRate).toBeCloseTo(91 / 110, 5);
    // Weighted: (1*100 + 5*10) / 110 ≈ 1.364 — not the plain average (3).
    expect(out!.byOrigin.human!.medianReviewRounds).toBeCloseTo(150 / 110, 5);
  });
});

describe("computeDeliveryQuality — previous-period deltas", () => {
  it("computes current - previous for revert/cascade/fix-latency/churn", () => {
    const repos = [
      repo({
        id: "r1",
        revert_rate: 0.1,
        cascade_rate: 0.05,
        commits_total: 100,
      }),
    ];
    const payloads = new Map<string, ReportMetrics>();
    payloads.set(
      "r1",
      payload({
        fix_latency_median_hours: 5,
        new_code_churn_rate_2w: 0.2,
      }),
    );
    const previousPayloads = new Map<string, ReportMetrics>();
    previousPayloads.set(
      "r1",
      payload({
        revert_rate: 0.2,
        cascade_rate: 0.08,
        commits_total: 100,
        fix_latency_median_hours: 10,
        new_code_churn_rate_2w: 0.3,
      }),
    );

    const out = computeDeliveryQuality(repos, payloads, previousPayloads);
    expect(out.revertRateDelta).toBeCloseTo(0.1 - 0.2, 10);
    expect(out.cascadeRateDelta).toBeCloseTo(0.05 - 0.08, 10);
    expect(out.fixLatencyMedianHoursDelta).toBe(5 - 10);
    expect(out.newCodeChurnRate2wDelta).toBeCloseTo(0.2 - 0.3, 10);
  });

  it("returns null deltas when no previous payloads are given (back-compat)", () => {
    const repos = [repo({ id: "r1", revert_rate: 0.1, commits_total: 100 })];
    const payloads = new Map<string, ReportMetrics>();
    payloads.set("r1", payload({}));

    const out = computeDeliveryQuality(repos, payloads);
    expect(out.revertRateDelta).toBeNull();
    expect(out.cascadeRateDelta).toBeNull();
    expect(out.fixLatencyMedianHoursDelta).toBeNull();
    expect(out.newCodeChurnRate2wDelta).toBeNull();
  });
});

describe("computePRHealth — previous-period deltas", () => {
  it("computes current - previous for merged count/time-to-merge/single-pass/review-rounds", () => {
    const repos = [repo({ id: "r1", pr_merged_count: 50 })];
    const payloads = new Map<string, ReportMetrics>();
    payloads.set(
      "r1",
      payload({
        pr_merged_count: 50,
        pr_median_time_to_merge_hours: 10,
        pr_single_pass_rate: 0.8,
        pr_review_rounds_median: 1,
      }),
    );
    const previousPayloads = new Map<string, ReportMetrics>();
    previousPayloads.set(
      "r1",
      payload({
        pr_merged_count: 40,
        pr_median_time_to_merge_hours: 15,
        pr_single_pass_rate: 0.7,
        pr_review_rounds_median: 2,
      }),
    );

    const out = computePRHealth(repos, payloads, previousPayloads);
    expect(out).not.toBeNull();
    expect(out!.totalPRsMergedDelta).toBe(50 - 40);
    expect(out!.medianTimeToMergeHoursDelta).toBe(10 - 15);
    expect(out!.singlePassRateDelta).toBeCloseTo(0.8 - 0.7, 10);
    expect(out!.medianReviewRoundsDelta).toBe(1 - 2);
  });

  it("returns null deltas when no previous payloads are given (back-compat)", () => {
    const repos = [repo({ id: "r1", pr_merged_count: 50 })];
    const payloads = new Map<string, ReportMetrics>();
    payloads.set("r1", payload({ pr_merged_count: 50 }));

    const out = computePRHealth(repos, payloads);
    expect(out).not.toBeNull();
    expect(out!.totalPRsMergedDelta).toBeNull();
    expect(out!.medianTimeToMergeHoursDelta).toBeNull();
    expect(out!.singlePassRateDelta).toBeNull();
    expect(out!.medianReviewRoundsDelta).toBeNull();
  });
});

describe("isHyperEngineer — shared threshold", () => {
  it("qualifies on high_velocity_weeks alone", () => {
    expect(isHyperEngineer({ high_velocity_weeks: 1, ai_commit_pct: 0 })).toBe(
      true,
    );
  });

  it("qualifies on ai_commit_pct >= 80 alone", () => {
    expect(isHyperEngineer({ high_velocity_weeks: 0, ai_commit_pct: 80 })).toBe(
      true,
    );
    expect(isHyperEngineer({ high_velocity_weeks: 0, ai_commit_pct: 79 })).toBe(
      false,
    );
  });

  it("does not qualify when neither condition holds", () => {
    expect(isHyperEngineer({ high_velocity_weeks: 0, ai_commit_pct: 0 })).toBe(
      false,
    );
  });
});

describe("computeHyperEngineers — dedupes the same person across name variants", () => {
  function hyperAuthor(over: {
    name: string;
    email?: string;
    high_velocity_weeks?: number;
  }) {
    return {
      name: over.name,
      email: over.email,
      high_velocity_weeks: over.high_velocity_weeks ?? 1,
      ai_commit_pct: 50,
    };
  }

  it("merges two display-name variants that resolved to the same github username", () => {
    const payloads = new Map<string, ReportMetrics>([
      [
        "repo-a",
        payload({
          author_velocity: {
            authors: [hyperAuthor({ name: "Renato Guimaraes" })],
          },
        }),
      ],
      [
        "repo-b",
        payload({
          author_velocity: {
            authors: [hyperAuthor({ name: "Renato Guimarães (Bahia)" })],
          },
        }),
      ],
    ]);
    const nameToGithub = new Map([
      ["renato guimaraes", "renatoguimaraescb"],
      ["renato guimarães (bahia)", "renatoguimaraescb"],
    ]);

    const result = computeHyperEngineers(payloads, new Map(), nameToGithub);

    expect(result).toHaveLength(1);
    expect(result[0].github).toBe("renatoguimaraescb");
    expect(result[0].repos).toBe(2);
  });

  it("merges two display-name variants sharing a GitHub noreply email, surfacing github from userMap once merged", () => {
    const payloads = new Map<string, ReportMetrics>([
      [
        "repo-a",
        payload({
          author_velocity: {
            authors: [
              hyperAuthor({
                name: "Renato Guimaraes",
                email: "123+renatoguimaraescb@users.noreply.github.com",
              }),
            ],
          },
        }),
      ],
      [
        "repo-b",
        payload({
          author_velocity: {
            authors: [
              hyperAuthor({
                name: "renatoguimaraescb",
                email: "123+renatoguimaraescb@users.noreply.github.com",
              }),
            ],
          },
        }),
      ],
    ]);
    // Nothing in nameToGithub — the shared noreply email is what ties the
    // two name variants into one group; userMap (keyed by the normalized
    // email, which for a noreply address IS the github username) is what
    // then supplies the github field for display.
    const userMap = new Map([
      [
        "renatoguimaraescb",
        { name: "Renato Guimarães", github: "renatoguimaraescb" },
      ],
    ]);

    const result = computeHyperEngineers(payloads, userMap, new Map());

    expect(result).toHaveLength(1);
    expect(result[0].repos).toBe(2);
    expect(result[0].github).toBe("renatoguimaraescb");
  });

  it("keeps genuinely different people separate", () => {
    const payloads = new Map<string, ReportMetrics>([
      [
        "repo-a",
        payload({
          author_velocity: {
            authors: [hyperAuthor({ name: "Alice", email: "alice@corp.com" })],
          },
        }),
      ],
      [
        "repo-b",
        payload({
          author_velocity: {
            authors: [hyperAuthor({ name: "Bob", email: "bob@corp.com" })],
          },
        }),
      ],
    ]);
    const nameToGithub = new Map([
      ["alice", "alice-gh"],
      ["bob", "bob-gh"],
    ]);

    const result = computeHyperEngineers(payloads, new Map(), nameToGithub);

    expect(result).toHaveLength(2);
  });

  it("merges when a raw commit author name is literally the GitHub handle, resolved via userMap at grouping time (not just display time)", () => {
    // Real case: some repos record the commit author as "Lucas Tribioli"
    // (noreply email, resolves via nameToGithub for free); others record it
    // as "lucastribioliclickbus" (his own GitHub handle used as the local
    // git config name) with a corporate email that push-time API
    // resolution failed to tie to a login. nameToGithub has no entry for
    // that raw handle-as-name string, but userMap does (keyed by github
    // username, populated from the repo that resolved successfully) — the
    // grouping key computation must check userMap too, not just at display
    // time, or these end up as two separate cards for the same person.
    const payloads = new Map<string, ReportMetrics>([
      [
        "repo-a",
        payload({
          author_velocity: {
            authors: [
              hyperAuthor({
                name: "Lucas Tribioli",
                email: "999+lucastribioliclickbus@users.noreply.github.com",
              }),
            ],
          },
        }),
      ],
      [
        "repo-b",
        payload({
          author_velocity: {
            authors: [
              hyperAuthor({
                name: "lucastribioliclickbus",
                email: "lucas.tribioli@clickbus.com",
              }),
            ],
          },
        }),
      ],
    ]);
    const nameToGithub = new Map([["lucas tribioli", "lucastribioliclickbus"]]);
    const userMap = new Map([
      [
        "lucastribioliclickbus",
        { name: "Lucas Tribioli", github: "lucastribioliclickbus" },
      ],
    ]);

    const result = computeHyperEngineers(payloads, userMap, nameToGithub);

    expect(result).toHaveLength(1);
    expect(result[0].github).toBe("lucastribioliclickbus");
    expect(result[0].name).toBe("Lucas Tribioli");
    expect(result[0].repos).toBe(2);
  });

  it("counts a repo once even when the same merged identity appears under two name/email variants within that one repo", () => {
    const payloads = new Map<string, ReportMetrics>([
      [
        "repo-a",
        payload({
          author_velocity: {
            authors: [
              hyperAuthor({
                name: "Lucas Tribioli",
                email: "999+lucastribioliclickbus@users.noreply.github.com",
              }),
              hyperAuthor({
                name: "lucastribioliclickbus",
                email: "lucas.tribioli@clickbus.com",
              }),
            ],
          },
        }),
      ],
    ]);
    const nameToGithub = new Map([["lucas tribioli", "lucastribioliclickbus"]]);
    const userMap = new Map([
      [
        "lucastribioliclickbus",
        { name: "Lucas Tribioli", github: "lucastribioliclickbus" },
      ],
    ]);

    const result = computeHyperEngineers(payloads, userMap, nameToGithub);

    expect(result).toHaveLength(1);
    expect(result[0].repos).toBe(1);
  });

  it("merges an 'unidentified' entry into an 'identified' one via a shared raw email, when neither name nor userMap resolves it directly", () => {
    // Same person, two repos: repo-a's commit name resolves to a github via
    // nameToGithub (this repo would render "identified"). repo-b uses a
    // completely different name string (e.g. a nickname) with the SAME raw
    // email — neither nameToGithub nor userMap has an entry for that name,
    // so without the email bridge this would render as a second,
    // "unidentified" card for the same real person.
    const payloads = new Map<string, ReportMetrics>([
      [
        "repo-a",
        payload({
          author_velocity: {
            authors: [
              hyperAuthor({ name: "Carla Souza", email: "carla@corp.com" }),
            ],
          },
        }),
      ],
      [
        "repo-b",
        payload({
          author_velocity: {
            authors: [
              hyperAuthor({ name: "carlinha", email: "carla@corp.com" }),
            ],
          },
        }),
      ],
    ]);
    const nameToGithub = new Map([["carla souza", "carla-gh"]]);

    const result = computeHyperEngineers(payloads, new Map(), nameToGithub);

    expect(result).toHaveLength(1);
    expect(result[0].github).toBe("carla-gh");
    expect(result[0].repos).toBe(2);
  });

  it("still includes an engineer with no resolved GitHub username, with github left undefined", () => {
    // computeHyperEngineers doesn't filter these out — the "identified" vs
    // "unidentified" split is a display concern, done in HyperEngineers.tsx.
    const payloads = new Map<string, ReportMetrics>([
      [
        "repo-a",
        payload({
          author_velocity: {
            authors: [
              hyperAuthor({
                name: "Mystery Person",
                email: "mystery@corp.com",
              }),
            ],
          },
        }),
      ],
    ]);

    const result = computeHyperEngineers(payloads, new Map(), new Map());

    expect(result).toHaveLength(1);
    expect(result[0].github).toBeUndefined();
  });
});
