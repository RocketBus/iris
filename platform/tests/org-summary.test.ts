import { describe, expect, it } from "vitest";

import {
  computeAIvsHuman,
  computeOrgPulse,
  computePreviousTotals,
  computePRHealth,
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
