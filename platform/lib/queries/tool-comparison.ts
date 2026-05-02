/**
 * AI Tool Comparison aggregation across repos.
 *
 * Combines per-tool signals from the engine (durability_by_tool,
 * cascade_rate_by_tool, revert_by_tool, acceptance_by_tool) into one
 * comparable row per tool at org level.
 */

import type { ReportMetrics } from "@/types/metrics";
import type { ToolComparison, ToolRow } from "@/types/tool-comparison";

const DEFAULT_COMMIT_THRESHOLD = 30;

interface ToolAccumulator {
  tool: string;
  commits: number;
  // Durability
  survivalSum: number;
  linesSum: number;
  // Cascade
  cascadeSum: number;
  cascadeWeight: number;
  // Reverts
  reverts: number;
  // PR single-pass
  singlePassSum: number;
  singlePassWeight: number;
}

function emptyAcc(tool: string): ToolAccumulator {
  return {
    tool,
    commits: 0,
    survivalSum: 0,
    linesSum: 0,
    cascadeSum: 0,
    cascadeWeight: 0,
    reverts: 0,
    singlePassSum: 0,
    singlePassWeight: 0,
  };
}

function ratio(num: number, denom: number): number | null {
  if (denom <= 0) return null;
  return num / denom;
}

export function computeToolComparison(
  payloads: Map<string, ReportMetrics>,
  commitThreshold: number = DEFAULT_COMMIT_THRESHOLD,
): ToolComparison | null {
  const accs = new Map<string, ToolAccumulator>();

  for (const [, p] of payloads) {
    const seenTools = new Set<string>();

    // Durability — weighted by lines_introduced
    if (p.durability_by_tool) {
      for (const [tool, m] of Object.entries(p.durability_by_tool)) {
        const acc = accs.get(tool) ?? emptyAcc(tool);
        acc.survivalSum += m.survival_rate * m.lines_introduced;
        acc.linesSum += m.lines_introduced;
        accs.set(tool, acc);
        seenTools.add(tool);
      }
    }

    // Cascade — weighted by total_commits; also our primary source of tool commit counts
    if (p.cascade_rate_by_tool) {
      for (const [tool, m] of Object.entries(p.cascade_rate_by_tool)) {
        const acc = accs.get(tool) ?? emptyAcc(tool);
        acc.commits += m.total_commits;
        acc.cascadeSum += m.cascade_rate * m.total_commits;
        acc.cascadeWeight += m.total_commits;
        accs.set(tool, acc);
        seenTools.add(tool);
      }
    }

    // Reverts — raw count per tool
    if (p.revert_by_tool) {
      for (const [tool, m] of Object.entries(p.revert_by_tool)) {
        const acc = accs.get(tool) ?? emptyAcc(tool);
        acc.reverts += m.reverts;
        accs.set(tool, acc);
        seenTools.add(tool);
      }
    }

    // Acceptance / single-pass — weighted by commits_in_prs
    if (p.acceptance_by_tool) {
      for (const [tool, m] of Object.entries(p.acceptance_by_tool)) {
        const acc = accs.get(tool) ?? emptyAcc(tool);
        const weight = m.commits_in_prs ?? 0;
        if (weight > 0) {
          acc.singlePassSum += m.single_pass_rate * weight;
          acc.singlePassWeight += weight;
        }
        // If cascade didn't provide commit counts, fall back to acceptance
        if (acc.commits === 0 && m.total_commits) {
          acc.commits += m.total_commits;
        }
        accs.set(tool, acc);
        seenTools.add(tool);
      }
    }
  }

  if (accs.size === 0) return null;

  const rows: ToolRow[] = [];
  for (const acc of accs.values()) {
    const durability = ratio(acc.survivalSum, acc.linesSum);
    const cascadeRate = ratio(acc.cascadeSum, acc.cascadeWeight);
    const revertRate = ratio(acc.reverts, acc.commits);
    const singlePassRate = ratio(acc.singlePassSum, acc.singlePassWeight);

    rows.push({
      tool: acc.tool,
      commits: acc.commits,
      durability,
      cascadeRate,
      revertRate,
      singlePassRate,
      belowThreshold: acc.commits < commitThreshold,
    });
  }

  // Sort: meaningful rows first (desc by commits), below-threshold at the end
  rows.sort((a, b) => {
    if (a.belowThreshold !== b.belowThreshold) {
      return a.belowThreshold ? 1 : -1;
    }
    return b.commits - a.commits;
  });

  const significantTools = rows.filter((r) => !r.belowThreshold).length;

  return {
    rows,
    commitThreshold,
    significantTools,
  };
}
