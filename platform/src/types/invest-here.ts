/**
 * Types for "Investment Hotspots" — systemic recommendations of where engineering
 * attention would reduce the most rework.
 *
 * All hotspots are systemic (directory, file coupling, origin). No per-person fields.
 */

export type HotspotSeverity = 'high' | 'medium' | 'low';

export interface WeakDirectoryHotspot {
  kind: 'weak_directory';
  severity: HotspotSeverity;
  directory: string;
  stabilizationRatio: number;
  churnEvents: number;
  filesTouched: number;
  filesStabilized: number;
}

export interface TightCouplingHotspot {
  kind: 'tight_coupling';
  severity: HotspotSeverity;
  fileA: string;
  fileB: string;
  couplingRate: number;
  coOccurrences: number;
}

export interface FixMagnetHotspot {
  kind: 'fix_magnet';
  severity: HotspotSeverity;
  origin: string;
  disproportionality: number;
  codeSharePct: number;
  fixSharePct: number;
  fixesAttracted: number;
}

export type InvestmentHotspot =
  | WeakDirectoryHotspot
  | TightCouplingHotspot
  | FixMagnetHotspot;

export interface InvestmentHotspots {
  hotspots: InvestmentHotspot[];
  /** How many raw signals were considered (before filtering). */
  sourceCounts: {
    directories: number;
    couplings: number;
    origins: number;
  };
}
