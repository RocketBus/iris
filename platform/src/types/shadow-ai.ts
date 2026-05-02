/**
 * Types for Shadow AI Exposure — how much AI use is attributed (co-author traces)
 * vs how much is pattern-matched but unattributed in the repo history.
 *
 * All values are systemic (org/repo-level aggregates). Never per-person.
 */

export interface ShadowAIExposureRepo {
  repositoryId: string;
  name: string;
  /** Commits classified as AI_ASSISTED (co-author trace present). */
  attributedCommits: number;
  /** Total non-bot commits (AI_ASSISTED + HUMAN). */
  nonBotCommits: number;
  /** Human commits (baseline for flagged ratio). */
  humanCommits: number;
  /** Human commits that match >= 2 AI-like signals (burst, LOC, interval, spread). */
  flaggedCommits: number;
  /** Ratio of attributed AI over non-bot commits (0-100). Null when nonBotCommits == 0. */
  attributedCoveragePct: number | null;
  /** Ratio of flagged over human commits (0-100). Null when no signal present. */
  shadowSignalPct: number | null;
  /** (attributedCommits + flaggedCommits) / nonBotCommits * 100. Upper-bound estimate. */
  estimatedExposurePct: number | null;
  /** estimatedExposurePct - attributedCoveragePct. Higher = more likely hidden AI. */
  gapPoints: number | null;
}

export interface ShadowAIExposureOrg {
  /** Sum of attributedCommits across repos. */
  attributedCommits: number;
  /** Sum of nonBotCommits across repos. */
  nonBotCommits: number;
  /** Sum of humanCommits across repos (denominator for shadow signal). */
  humanCommits: number;
  /** Sum of flaggedCommits across repos. */
  flaggedCommits: number;
  /** Weighted by nonBotCommits. */
  attributedCoveragePct: number | null;
  /** Weighted by humanCommits. */
  shadowSignalPct: number | null;
  /** Upper-bound estimated AI exposure at org level. */
  estimatedExposurePct: number | null;
  /** estimatedExposurePct - attributedCoveragePct. */
  gapPoints: number | null;
  /** Repos included in the calculation. */
  reposConsidered: number;
}

export interface ShadowAIExposure {
  org: ShadowAIExposureOrg;
  repos: ShadowAIExposureRepo[];
}
