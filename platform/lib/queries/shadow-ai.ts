/**
 * Shadow AI Exposure computation.
 *
 * Combines two engine signals:
 *  - `ai_detection_coverage_pct` / `commit_origin_distribution` — attributed AI
 *  - `attribution_gap` — human commits matching AI-like patterns (burst, LOC, interval, spread)
 *
 * Produces an estimate of hidden AI exposure at org and per-repo level.
 * Every value is systemic (no per-person fields).
 */

import type { ReportMetrics } from "@/types/metrics";
import type {
  ShadowAIExposure,
  ShadowAIExposureOrg,
  ShadowAIExposureRepo,
} from "@/types/shadow-ai";

interface RepoInput {
  id: string;
  name: string;
}

function ratioPct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

export function computeShadowAIExposure(
  repos: RepoInput[],
  payloads: Map<string, ReportMetrics>,
): ShadowAIExposure {
  const repoRows: ShadowAIExposureRepo[] = [];

  let orgAttributed = 0;
  let orgNonBot = 0;
  let orgHuman = 0;
  let orgFlagged = 0;
  let reposConsidered = 0;

  for (const repo of repos) {
    const payload = payloads.get(repo.id);
    if (!payload) continue;

    const dist = payload.commit_origin_distribution;
    const attributed = dist?.AI_ASSISTED ?? 0;
    const humanDist = dist?.HUMAN ?? 0;
    const nonBot = attributed + humanDist;

    const gap = payload.attribution_gap;
    const flagged = gap?.flagged_commits ?? 0;
    const humanBaseline = gap?.total_human_commits ?? humanDist;

    if (nonBot === 0 && flagged === 0) continue;

    reposConsidered++;
    orgAttributed += attributed;
    orgNonBot += nonBot;
    orgHuman += humanBaseline;
    orgFlagged += flagged;

    const attributedCoveragePct = ratioPct(attributed, nonBot);
    const shadowSignalPct =
      humanBaseline > 0 ? ratioPct(flagged, humanBaseline) : null;
    const estimatedExposurePct =
      nonBot > 0 ? ratioPct(attributed + flagged, nonBot) : null;
    const gapPoints =
      estimatedExposurePct !== null && attributedCoveragePct !== null
        ? estimatedExposurePct - attributedCoveragePct
        : null;

    repoRows.push({
      repositoryId: repo.id,
      name: repo.name,
      attributedCommits: attributed,
      nonBotCommits: nonBot,
      humanCommits: humanBaseline,
      flaggedCommits: flagged,
      attributedCoveragePct,
      shadowSignalPct,
      estimatedExposurePct,
      gapPoints,
    });
  }

  const orgAttributedPct = ratioPct(orgAttributed, orgNonBot);
  const orgShadowSignalPct = ratioPct(orgFlagged, orgHuman);
  const orgEstimated = ratioPct(orgAttributed + orgFlagged, orgNonBot);
  const orgGap =
    orgEstimated !== null && orgAttributedPct !== null
      ? orgEstimated - orgAttributedPct
      : null;

  const org: ShadowAIExposureOrg = {
    attributedCommits: orgAttributed,
    nonBotCommits: orgNonBot,
    humanCommits: orgHuman,
    flaggedCommits: orgFlagged,
    attributedCoveragePct: orgAttributedPct,
    shadowSignalPct: orgShadowSignalPct,
    estimatedExposurePct: orgEstimated,
    gapPoints: orgGap,
    reposConsidered,
  };

  // Sort repos by gapPoints desc, then by flaggedCommits desc as tiebreaker
  repoRows.sort((a, b) => {
    const gapA = a.gapPoints ?? -Infinity;
    const gapB = b.gapPoints ?? -Infinity;
    if (gapB !== gapA) return gapB - gapA;
    return b.flaggedCommits - a.flaggedCommits;
  });

  return { org, repos: repoRows };
}
