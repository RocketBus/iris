/**
 * Types for board flow analysis (GitHub Projects V2).
 *
 * Nothing here encodes a particular workflow. Column names are free text on
 * every board, so a board's columns are mapped onto lifecycle buckets either
 * explicitly (per-board `status_config`) or by generic name heuristics.
 */

/**
 * Lifecycle buckets a column can map to.
 *
 * `queue` is the one addition to the obvious four. Boards routinely have
 * columns that are neither backlog nor work-in-flight — "Ready for X",
 * "Awaiting Y", "Blocked". Folding those into `active` inflates flow
 * efficiency (the metric whose entire job is exposing invisible waiting), and
 * folding them into `backlog` corrupts backlog-growth. They get their own
 * bucket: counted as waiting, not as backlog.
 */
export type LifecycleBucket =
  "backlog" | "discovery" | "active" | "queue" | "done";

/** Per-board column mapping. Keys are bucket names, values are column names. */
export type StatusConfig = Partial<Record<LifecycleBucket, string[]>>;

export interface StatusClassification {
  /** Lowercased column name → bucket. */
  byStatus: Map<string, LifecycleBucket>;
  /**
   * Columns seen on the board that matched neither the explicit config nor any
   * heuristic. Surfaced as a warning: a column silently treated as "not done"
   * skews lead time for every item that ends there.
   */
  unmapped: string[];
}

export interface BoardItemInput {
  id: string;
  title: string;
  contentType: "ISSUE" | "PULL_REQUEST" | "DRAFT_ISSUE";
  currentStatus: string | null;
  /** OPEN | CLOSED | MERGED; null for drafts. */
  contentState: string | null;
  sourceCreatedAt: string | null;
  sourceClosedAt: string | null;
  itemUpdatedAt: string | null;
  assignees: string[];
  labels: string[];
  iteration: string | null;
  priority: string | null;
  size: string | null;
  /** False for drafts and for items whose history fetch never succeeded. */
  historyAvailable: boolean;
}

export interface StatusEventInput {
  itemId: string;
  kind: "ADDED" | "STATUS_CHANGED" | "REMOVED";
  previousStatus: string | null;
  status: string | null;
  occurredAt: string;
  wasAutomated: boolean;
}

/**
 * Where a lead time number came from. Anything other than `transitions` is an
 * approximation and must be labelled as such wherever it is displayed.
 */
export type LeadTimeSource = "transitions" | "closed_at" | "item_updated_at";

export interface PhaseVisit {
  status: string;
  bucket: LifecycleBucket | null;
  enteredAt: string;
  /** Null while the item still sits in this column. */
  exitedAt: string | null;
  hours: number;
}

export interface ItemFlow {
  itemId: string;
  title: string;
  enteredBoardAt: string | null;
  /** Chronological, one entry per visit — re-entering a column adds a visit. */
  visits: PhaseVisit[];
  /** Accumulated hours per column, summing every visit. */
  hoursByStatus: Record<string, number>;
  /** Visit count per column. > 1 means the item came back. */
  passesByStatus: Record<string, number>;
  terminalAt: string | null;
  isTerminal: boolean;
  /** Taken off the board. An exit, never a completion. */
  removedFromBoard: boolean;
  currentStatus: string | null;
  assignees: string[];
  leadTimeHours: number | null;
  leadTimeSource: LeadTimeSource | null;
  cycleTimeHours: number | null;
  activeHours: number;
  /** activeHours / leadTimeHours; null when lead time is unknown or zero. */
  flowEfficiency: number | null;
  /** Age of a non-terminal item since it entered the board. */
  ageHours: number | null;
  hoursInCurrentStatus: number | null;
  /** True when any displayed duration for this item rests on a fallback. */
  approximate: boolean;
}

/**
 * Percentiles with an explicit sample guard. `suppressed` names the
 * percentiles withheld because the sample was too small to support them —
 * displaying P95 over six observations is worse than displaying nothing.
 */
export interface PercentileSet {
  n: number;
  p50: number | null;
  p70: number | null;
  p85: number | null;
  p95: number | null;
  suppressed: string[];
  /** Raw sorted observations, so a small sample can be shown as a strip plot. */
  raw: number[];
}

export interface PhaseStat {
  status: string;
  bucket: LifecycleBucket | null;
  /** Items that passed through this column at least once. */
  n: number;
  medianHours: number | null;
  totalHours: number;
  /** Items that entered this column more than once. */
  reentered: number;
}

export interface WeeklyCount {
  /** ISO week key, e.g. "2026-W34". */
  week: string;
  count: number;
}

export interface FlowBalance {
  week: string;
  inflow: number;
  outflow: number;
  /** Running sum of (inflow - outflow) up to and including this week. */
  cumulativeDelta: number;
}

export interface CfdPoint {
  week: string;
  /** Item count per column at the end of that week. */
  counts: Record<string, number>;
}

export interface AgingColumn {
  status: string;
  bucket: LifecycleBucket | null;
  count: number;
  medianAgeHours: number | null;
  maxAgeHours: number | null;
}

export interface StalledItem {
  itemId: string;
  title: string;
  currentStatus: string | null;
  /** Hours since the last status transition (or board entry). */
  hoursSinceLastMove: number;
  /** Hours since the item entered the board. */
  totalAgeHours: number;
  assignees: string[];
}

export interface LittlesLawCheck {
  wip: number;
  /** Mean items reaching a terminal column per week. */
  throughputPerWeek: number | null;
  /** WIP / throughput, expressed in hours. Null when throughput is zero. */
  predictedLeadTimeHours: number | null;
  observedLeadTimeHours: number | null;
  /** |predicted - observed| / observed. Large values mean the model is off. */
  divergenceRatio: number | null;
}

export interface CoverageStats {
  totalItems: number;
  /** Items with real transition history (excludes drafts). */
  itemsWithHistory: number;
  /** Items counted with a fallback lead time. */
  itemsApproximated: number;
  historyCoveragePct: number;
}

export interface BoardFlowSummary {
  boardId: string;
  title: string;
  teamSlug: string | null;
  coverage: CoverageStats;
  leadTime: PercentileSet;
  cycleTime: PercentileSet;
  phases: PhaseStat[];
  flowEfficiencyMedian: number | null;
  throughput: WeeklyCount[];
  balance: FlowBalance[];
  wip: number;
  aging: AgingColumn[];
  stalled: StalledItem[];
  cfd: CfdPoint[];
  littlesLaw: LittlesLawCheck;
  unmappedStatuses: string[];
  /**
   * Resolved bucket for every column seen, keyed by the column's own spelling.
   *
   * The UI needs it to group a cumulative-flow diagram by lifecycle stage: a
   * real board can carry a dozen-plus columns, and stacking that many series is
   * unreadable, while five buckets make accumulation obvious.
   */
  statusBuckets: Record<string, LifecycleBucket>;
}

// ---------------------------------------------------------------------------
// Quality gates
// ---------------------------------------------------------------------------

export type GateSeverity = "ok" | "warning" | "critical";

export type GateId =
  | "synthetic_items"
  | "mass_import"
  | "done_not_closed"
  | "bulk_movement"
  | "field_completeness"
  | "assignee_concentration"
  | "history_coverage";

export interface QualityGate {
  id: GateId;
  severity: GateSeverity;
  /** The measured value the severity was decided on. */
  value: number;
  /** Unit of `value`, for display. */
  unit: "percent" | "count";
  affectedItemIds: string[];
  /**
   * Plain-language statement of what this does to the reading. Written in
   * English as the neutral base, same convention as the engine's narrative
   * output; the UI layer localizes by `id`.
   */
  summary: string;
}

export interface QualityReport {
  gates: QualityGate[];
  /** Worst severity across gates — drives how loudly the UI hedges. */
  overall: GateSeverity;
  /**
   * True when at least one critical gate fired. Metrics should still be
   * computed and shown, but never without the warning attached.
   */
  degraded: boolean;
}
