/**
 * Compose investment hotspots from existing engine signals:
 *  - stability_map: directories with low stabilization ratio + meaningful churn
 *  - churn_couplings: file pairs co-changing at high rates
 *  - fix_target_by_origin: origins attracting disproportionate fixes
 *
 * Pure function over a single repo payload. Systemic only — never per-person.
 */

import type {
  FixMagnetHotspot,
  HotspotSeverity,
  InvestmentHotspot,
  InvestmentHotspots,
  TightCouplingHotspot,
  WeakDirectoryHotspot,
} from "@/types/invest-here";
import type { FixTargetMetrics, ReportMetrics } from "@/types/metrics";

// Thresholds — picked conservatively to avoid noise
const WEAK_DIR_MAX_RATIO = 0.5;
const WEAK_DIR_MIN_CHURN = 5;
const WEAK_DIR_HIGH_RATIO = 0.3;
const WEAK_DIR_MED_RATIO = 0.4;
const WEAK_DIR_LIMIT = 5;

const COUPLING_MIN_RATE = 0.6;
const COUPLING_MIN_OCCURRENCES = 3;
const COUPLING_HIGH_RATE = 0.9;
const COUPLING_MED_RATE = 0.75;
const COUPLING_LIMIT = 5;

const FIX_MIN_DISPROPORTIONALITY = 2;
const FIX_MIN_FIXES = 5;
const FIX_HIGH_DISPROPORTIONALITY = 3;
const FIX_MED_DISPROPORTIONALITY = 2.5;
const FIX_LIMIT = 3;

const TOTAL_LIMIT = 10;

const severityRank: Record<HotspotSeverity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function weakDirSeverity(ratio: number): HotspotSeverity {
  if (ratio < WEAK_DIR_HIGH_RATIO) return 'high';
  if (ratio < WEAK_DIR_MED_RATIO) return 'medium';
  return 'low';
}

function couplingSeverity(rate: number): HotspotSeverity {
  if (rate >= COUPLING_HIGH_RATE) return 'high';
  if (rate >= COUPLING_MED_RATE) return 'medium';
  return 'low';
}

function fixSeverity(disp: number): HotspotSeverity {
  if (disp >= FIX_HIGH_DISPROPORTIONALITY) return 'high';
  if (disp >= FIX_MED_DISPROPORTIONALITY) return 'medium';
  return 'low';
}

export function computeInvestmentHotspots(
  payload: ReportMetrics | null | undefined,
): InvestmentHotspots {
  const sourceCounts = { directories: 0, couplings: 0, origins: 0 };
  if (!payload) {
    return { hotspots: [], sourceCounts };
  }

  const hotspots: InvestmentHotspot[] = [];

  // 1. Weak directories
  const directories = payload.stability_map ?? [];
  sourceCounts.directories = directories.length;

  const weakDirs: WeakDirectoryHotspot[] = directories
    .filter(
      (d) =>
        d.stabilization_ratio < WEAK_DIR_MAX_RATIO &&
        d.churn_events >= WEAK_DIR_MIN_CHURN,
    )
    .sort((a, b) => {
      // Primary: lower ratio first; tiebreak: more churn events
      if (a.stabilization_ratio !== b.stabilization_ratio) {
        return a.stabilization_ratio - b.stabilization_ratio;
      }
      return b.churn_events - a.churn_events;
    })
    .slice(0, WEAK_DIR_LIMIT)
    .map((d) => ({
      kind: 'weak_directory',
      severity: weakDirSeverity(d.stabilization_ratio),
      directory: d.directory,
      stabilizationRatio: d.stabilization_ratio,
      churnEvents: d.churn_events,
      filesTouched: d.files_touched,
      filesStabilized: d.files_stabilized,
    }));

  // 2. Tight couplings
  const couplings = payload.churn_couplings ?? [];
  sourceCounts.couplings = couplings.length;

  const tightCouplings: TightCouplingHotspot[] = couplings
    .filter(
      (c) =>
        c.coupling_rate >= COUPLING_MIN_RATE &&
        c.co_occurrences >= COUPLING_MIN_OCCURRENCES,
    )
    .sort((a, b) => {
      if (a.coupling_rate !== b.coupling_rate) {
        return b.coupling_rate - a.coupling_rate;
      }
      return b.co_occurrences - a.co_occurrences;
    })
    .slice(0, COUPLING_LIMIT)
    .map((c) => ({
      kind: 'tight_coupling',
      severity: couplingSeverity(c.coupling_rate),
      fileA: c.file_a,
      fileB: c.file_b,
      couplingRate: c.coupling_rate,
      coOccurrences: c.co_occurrences,
    }));

  // 3. Fix magnets
  const fixByOrigin = payload.fix_target_by_origin ?? {};
  const origins = Object.entries(fixByOrigin) as Array<
    [string, FixTargetMetrics]
  >;
  sourceCounts.origins = origins.length;

  const fixMagnets: FixMagnetHotspot[] = origins
    .filter(
      ([, m]) =>
        m.disproportionality >= FIX_MIN_DISPROPORTIONALITY &&
        m.fixes_attracted >= FIX_MIN_FIXES,
    )
    .sort(([, a], [, b]) => b.disproportionality - a.disproportionality)
    .slice(0, FIX_LIMIT)
    .map(([origin, m]) => ({
      kind: 'fix_magnet',
      severity: fixSeverity(m.disproportionality),
      origin,
      disproportionality: m.disproportionality,
      codeSharePct: m.code_share_pct,
      fixSharePct: m.fix_share_pct,
      fixesAttracted: m.fixes_attracted,
    }));

  hotspots.push(...weakDirs, ...tightCouplings, ...fixMagnets);

  // Final sort by severity (high first), then keep insertion order within tier
  hotspots.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);

  return {
    hotspots: hotspots.slice(0, TOTAL_LIMIT),
    sourceCounts,
  };
}
