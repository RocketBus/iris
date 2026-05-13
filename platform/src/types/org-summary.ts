/**
 * Types for org-level aggregated summary.
 * All interfaces represent pre-computed data passed to client section components.
 */

/** Hero cards — top-level org pulse. */
export interface OrgPulse {
  totalCommits: number;
  totalCommitsDelta: number | null;
  prsMerged: number;
  prsMergedDelta: number | null;
  activeRepos: number;
  activeContributors: number;
  avgStabilization: number | null;
  avgStabilizationDelta: number | null;
  aiAdoptionPct: number | null;
  aiAdoptionDelta: number | null;
  sparklines: {
    commits: number[];
    stabilization: number[];
    aiAdoption: number[];
  };
}

/** Delivery quality signals aggregated across all repos. */
export interface DeliveryQuality {
  /** Per-repo stabilization values for distribution chart. */
  stabilizationDistribution: Array<{ name: string; value: number }>;
  revertRate: number | null;
  cascadeRate: number | null;
  fixLatencyMedianHours: number | null;
  newCodeChurnRate2w: number | null;
  newCodeChurnRate4w: number | null;
  reposWithData: number;
  totalRepos: number;
}

/** AI vs Human comparison data. */
export interface AIvsHumanData {
  /** Org-wide commit mix timeline (aggregated across repos). */
  commitMix: Array<{
    date: string;
    human: number;
    ai: number;
    bot: number;
  }>;
  stabilization: { human: number | null; ai: number | null };
  durability: { human: number | null; ai: number | null };
  cascadeRate: { human: number | null; ai: number | null };
  /** AI tool usage counts across all repos. */
  toolBreakdown: Array<{ tool: string; commits: number }>;
  attributionGap: {
    flaggedPct: number;
    flaggedCommits: number;
    totalHumanCommits: number;
  } | null;
  reposWithAI: number;
}

/** Intent distribution aggregated across all repos. */
export interface IntentData {
  distribution: Record<string, number>;
  featureToFixRatio: number | null;
  /** Weekly intent trend (aggregated). */
  timeline: Array<{
    date: string;
    FEATURE: number;
    FIX: number;
    REFACTOR: number;
    CONFIG: number;
    UNKNOWN: number;
  }>;
  reposWithData: number;
}

/** PR health metrics aggregated across all repos. */
export interface PRHealthData {
  totalPRsMerged: number;
  medianTimeToMergeHours: number | null;
  singlePassRate: number | null;
  medianReviewRounds: number | null;
  medianPRSizeLines: number | null;
  byOrigin: {
    human: {
      singlePassRate: number | null;
      medianReviewRounds: number | null;
    } | null;
    ai: {
      singlePassRate: number | null;
      medianReviewRounds: number | null;
    } | null;
  };
  reposWithData: number;
}

/** Single entry for the health map treemap. */
export interface HealthMapEntry {
  name: string;
  id: string;
  commits: number;
  stabilization: number;
  delta: number | null;
  health: string;
}

/** A hyper engineer detected across the org. */
export interface HyperEngineer {
  name: string;
  github?: string;
  /** Number of repos where this person qualified. */
  repos: number;
  highVelocityWeeks: number;
  aiCommitPct: number;
}

/** Single week in the org-wide timeline. */
export interface OrgTimelineWeek {
  weekStart: string;
  commits: number;
  linesChanged: number;
  stabilization: number | null;
  churnEvents: number;
  aiPct: number | null;
  featurePct: number | null;
  fixPct: number | null;
}

/**
 * DORA (real) aggregated across the org's repos. Populated only when at
 * least one repo's latest run carries `dora_source === "datadog"`.
 * Counts are summed; rates are weighted by the number of evaluated
 * deployments contributing to each repo's value (mirrors the engine's
 * per-commit semantics — each evaluated deploy is one unit of weight).
 */
export interface OrgDORA {
  reposWithData: number;
  deploymentsTotal: number;
  deploymentsFailed: number;
  deploymentsPendingEvaluation: number;
  incidentsTotal: number;
  /** 0.0–1.0 weighted by evaluated deploys; null if denominator is zero. */
  cfr: number | null;
  rollbacksTotal: number;
  /** 0.0–1.0 weighted by failed deploys; null if no failures. */
  rollbackRate: number | null;
  /** Seconds; median across repos that report a value. */
  mttrPerDeploySecondsMedian: number | null;
  mttrPerIncidentSecondsMedian: number | null;
  leadTimeSecondsMedian: number | null;
  /** Deploys per day, summed across repos (each repo's window contributes). */
  deployFrequencyPerDay: number | null;
  /** Per-origin CFR aggregation across the org. */
  cfrByOrigin: Array<{
    origin: "HUMAN" | "AI_ASSISTED" | "BOT";
    failed: number;
    evaluated: number;
    cfr: number;
  }>;
  /** Per-origin rollback aggregation across the org. */
  rollbackRateByOrigin: Array<{
    origin: "HUMAN" | "AI_ASSISTED" | "BOT";
    rollbacks: number;
    failed: number;
    rollbackRate: number;
  }>;
}
