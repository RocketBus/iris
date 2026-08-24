/**
 * Board flow metrics — pure functions over persisted items and status events.
 *
 * No I/O, no Supabase client: fully unit-testable, same convention as
 * `cycle-time-flow.ts`.
 *
 * Two rules run through everything here:
 *
 * 1. **A duration is only reported when the data supports it.** Items without
 *    transition history (drafts) are excluded from duration metrics rather than
 *    counted as zero, and a lead time derived from `closedAt` or `updatedAt`
 *    carries `leadTimeSource` so the UI can mark it approximate.
 *
 * 2. **Nothing assumes a workflow.** Column names are free text per board.
 *    They are mapped onto lifecycle buckets by explicit per-board config, and
 *    only fall back to generic name heuristics. Columns that match nothing are
 *    reported in `unmappedStatuses` instead of being quietly treated as
 *    not-done.
 */

import type {
  AgingColumn,
  BoardFlowSummary,
  BoardItemInput,
  CfdPoint,
  CoverageStats,
  FlowBalance,
  ItemFlow,
  LeadTimeSource,
  LifecycleBucket,
  LittlesLawCheck,
  PercentileSet,
  PhaseStat,
  PhaseVisit,
  StalledItem,
  StatusClassification,
  StatusConfig,
  StatusEventInput,
  WeeklyCount,
} from "@/types/board-flow";

const HOUR_MS = 3_600_000;
const WEEK_HOURS = 168;

/** Below this many observations, only the median and the raw strip are shown. */
export const MIN_SAMPLE_PERCENTILES = 10;
/** Below this many observations, P95 is withheld. */
export const MIN_SAMPLE_P95 = 20;
/** Items sitting still longer than this are listed as stalled. */
export const STALLED_THRESHOLD_HOURS = 168;

// ---------------------------------------------------------------------------
// Status classification
// ---------------------------------------------------------------------------

/**
 * Generic column-name heuristics, tried in order. First match wins, which is
 * why queue precedes active: "Ready for Development" is a queue, not
 * development. Patterns cover English and Portuguese column vocabularies;
 * anything else needs explicit per-board config, and says so via `unmapped`.
 */
const HEURISTICS: Array<[LifecycleBucket, RegExp]> = [
  [
    "done",
    /\b(done|closed|complete|completed|shipped|released|delivered|finished|cancel|conclu|finalizad|entregue|encerrad)/i,
  ],
  [
    "discovery",
    /\b(discovery|refinement|grooming|spec|design|analysis|research|scoping|descobert|refinament|analise|análise|especifica)/i,
  ],
  [
    "queue",
    /\b(ready|awaiting|waiting|blocked|queue|pending|on hold|hold|aguardando|bloquead|fila|pendente)/i,
  ],
  [
    "active",
    /\b(progress|doing|wip|dev|implement|review|test|qa|validat|verif|staging|deploy|monitor|homolog|desenvolv|revis|teste|valida)/i,
  ],
  [
    "backlog",
    /\b(backlog|icebox|inbox|triage|todo|to do|new|proposed|idea|novo|ideia|triagem|entrada)/i,
  ],
];

/**
 * Resolve every column seen on the board to a bucket.
 *
 * Explicit config always wins over heuristics — an organization whose "Review"
 * column means something unusual can say so without patching code.
 */
export function classifyStatuses(
  config: StatusConfig,
  seenStatuses: Iterable<string>,
): StatusClassification {
  const byStatus = new Map<string, LifecycleBucket>();

  for (const [bucket, names] of Object.entries(config)) {
    if (!Array.isArray(names)) continue;
    for (const name of names) {
      if (typeof name !== "string") continue;
      byStatus.set(name.trim().toLowerCase(), bucket as LifecycleBucket);
    }
  }

  const unmapped: string[] = [];
  for (const status of seenStatuses) {
    const key = status.trim().toLowerCase();
    if (!key || byStatus.has(key)) continue;

    const hit = HEURISTICS.find(([, pattern]) => pattern.test(key));
    if (hit) byStatus.set(key, hit[0]);
    else unmapped.push(status);
  }

  return { byStatus, unmapped: [...new Set(unmapped)] };
}

function bucketOf(
  status: string | null,
  classification: StatusClassification,
): LifecycleBucket | null {
  if (!status) return null;
  return classification.byStatus.get(status.trim().toLowerCase()) ?? null;
}

// ---------------------------------------------------------------------------
// Per-item flow
// ---------------------------------------------------------------------------

/**
 * Reconstruct one item's journey from its status events.
 *
 * Re-entry accumulates: each visit to a column is its own `PhaseVisit`, and
 * `hoursByStatus` sums them. A `REMOVED` event closes the current visit and
 * marks the item as off-board — an exit that is deliberately not a completion.
 */
export function buildItemFlow(
  item: BoardItemInput,
  events: StatusEventInput[],
  classification: StatusClassification,
  now: Date,
): ItemFlow {
  const ordered = [...events].sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );

  const visits: PhaseVisit[] = [];
  let enteredBoardAt: string | null = null;
  let removedFromBoard = false;
  let open: { status: string; enteredAt: string } | null = null;

  const closeOpen = (at: string) => {
    if (!open) return;
    visits.push({
      status: open.status,
      bucket: bucketOf(open.status, classification),
      enteredAt: open.enteredAt,
      exitedAt: at,
      hours: hoursBetween(open.enteredAt, at),
    });
    open = null;
  };

  for (const event of ordered) {
    if (enteredBoardAt === null && event.kind !== "REMOVED") {
      enteredBoardAt = event.occurredAt;
    }

    if (event.kind === "STATUS_CHANGED") {
      closeOpen(event.occurredAt);
      if (event.status) {
        open = { status: event.status, enteredAt: event.occurredAt };
      }
      // Re-added after removal: the item is back on the board.
      removedFromBoard = false;
    } else if (event.kind === "REMOVED") {
      closeOpen(event.occurredAt);
      removedFromBoard = true;
    }
  }

  // A still-open visit runs to now. Left open (exitedAt null) so callers can
  // tell "currently here" from "left at this time".
  if (open) {
    visits.push({
      status: open.status,
      bucket: bucketOf(open.status, classification),
      enteredAt: open.enteredAt,
      exitedAt: null,
      hours: hoursBetween(open.enteredAt, now.toISOString()),
    });
  }

  if (enteredBoardAt === null) enteredBoardAt = item.sourceCreatedAt;

  const hoursByStatus: Record<string, number> = {};
  const passesByStatus: Record<string, number> = {};
  for (const visit of visits) {
    hoursByStatus[visit.status] =
      (hoursByStatus[visit.status] ?? 0) + visit.hours;
    passesByStatus[visit.status] = (passesByStatus[visit.status] ?? 0) + 1;
  }

  const firstDone = visits.find((v) => v.bucket === "done") ?? null;
  const terminalAt = firstDone?.enteredAt ?? null;
  const isTerminal = terminalAt !== null;

  // Active time excludes the terminal column and every queue — the whole point
  // of flow efficiency is separating work from waiting.
  const activeHours = visits
    .filter((v) => v.bucket === "active")
    .reduce((sum, v) => sum + v.hours, 0);

  const { leadTimeHours, leadTimeSource } = resolveLeadTime(
    item,
    enteredBoardAt,
    terminalAt,
  );

  const firstActive = visits.find((v) => v.bucket === "active") ?? null;
  const cycleTimeHours =
    firstActive && terminalAt
      ? hoursBetween(firstActive.enteredAt, terminalAt)
      : null;

  const currentVisit = visits.length > 0 ? visits[visits.length - 1] : null;
  const lastMoveAt = currentVisit?.enteredAt ?? enteredBoardAt;

  return {
    itemId: item.id,
    title: item.title,
    enteredBoardAt,
    visits,
    hoursByStatus,
    passesByStatus,
    terminalAt,
    isTerminal,
    removedFromBoard,
    currentStatus: item.currentStatus,
    assignees: item.assignees,
    leadTimeHours,
    leadTimeSource,
    cycleTimeHours,
    activeHours,
    flowEfficiency:
      leadTimeHours !== null && leadTimeHours > 0
        ? activeHours / leadTimeHours
        : null,
    ageHours:
      !isTerminal && enteredBoardAt
        ? hoursBetween(enteredBoardAt, now.toISOString())
        : null,
    hoursInCurrentStatus:
      !isTerminal && lastMoveAt
        ? hoursBetween(lastMoveAt, now.toISOString())
        : null,
    approximate: leadTimeSource !== null && leadTimeSource !== "transitions",
  };
}

/**
 * Lead time, with the fallback ladder from the spec.
 *
 * Transitions are exact. `closedAt` is a decent proxy but says nothing about
 * when the board considered the work done. `updatedAt` is a last resort — any
 * edit moves it — and only ever used for items that have no better signal.
 * Anything but the first rung sets `leadTimeSource` so the number is labelled.
 */
function resolveLeadTime(
  item: BoardItemInput,
  enteredBoardAt: string | null,
  terminalAt: string | null,
): { leadTimeHours: number | null; leadTimeSource: LeadTimeSource | null } {
  const start = enteredBoardAt ?? item.sourceCreatedAt;
  if (!start) return { leadTimeHours: null, leadTimeSource: null };

  if (item.historyAvailable && terminalAt) {
    return {
      leadTimeHours: hoursBetween(start, terminalAt),
      leadTimeSource: "transitions",
    };
  }
  if (item.sourceClosedAt) {
    return {
      leadTimeHours: hoursBetween(start, item.sourceClosedAt),
      leadTimeSource: "closed_at",
    };
  }
  // Only for items the board already considers finished; an open item has no
  // lead time yet, and `updatedAt` would invent one.
  if (terminalAt && item.itemUpdatedAt) {
    return {
      leadTimeHours: hoursBetween(start, item.itemUpdatedAt),
      leadTimeSource: "item_updated_at",
    };
  }
  return { leadTimeHours: null, leadTimeSource: null };
}

// ---------------------------------------------------------------------------
// Board aggregation
// ---------------------------------------------------------------------------

export interface SummarizeOptions {
  boardId: string;
  title: string;
  teamSlug?: string | null;
  statusConfig?: StatusConfig;
  now?: Date;
}

export function summarizeBoard(
  items: BoardItemInput[],
  events: StatusEventInput[],
  opts: SummarizeOptions,
): BoardFlowSummary {
  const now = opts.now ?? new Date();

  const seen = new Set<string>();
  for (const item of items)
    if (item.currentStatus) seen.add(item.currentStatus);
  for (const event of events) {
    if (event.status) seen.add(event.status);
    if (event.previousStatus) seen.add(event.previousStatus);
  }
  const classification = classifyStatuses(opts.statusConfig ?? {}, seen);

  const eventsByItem = new Map<string, StatusEventInput[]>();
  for (const event of events) {
    const list = eventsByItem.get(event.itemId);
    if (list) list.push(event);
    else eventsByItem.set(event.itemId, [event]);
  }

  const flows = items.map((item) =>
    buildItemFlow(item, eventsByItem.get(item.id) ?? [], classification, now),
  );

  const wipFlows = flows.filter((f) => !f.isTerminal && !f.removedFromBoard);

  return {
    boardId: opts.boardId,
    title: opts.title,
    teamSlug: opts.teamSlug ?? null,
    coverage: computeCoverage(items, flows),
    leadTime: percentiles(flows.map((f) => f.leadTimeHours).filter(isNumber)),
    cycleTime: percentiles(flows.map((f) => f.cycleTimeHours).filter(isNumber)),
    phases: computePhaseStats(flows, classification),
    flowEfficiencyMedian: median(
      flows.map((f) => f.flowEfficiency).filter(isNumber),
    ),
    throughput: weeklyCounts(flows.map((f) => f.terminalAt).filter(isString)),
    balance: computeBalance(flows),
    wip: wipFlows.length,
    aging: computeAging(wipFlows, classification),
    stalled: computeStalled(wipFlows),
    cfd: computeCfd(flows, now),
    littlesLaw: computeLittlesLaw(flows, wipFlows.length),
    unmappedStatuses: classification.unmapped,
  };
}

function computeCoverage(
  items: BoardItemInput[],
  flows: ItemFlow[],
): CoverageStats {
  const withHistory = items.filter((i) => i.historyAvailable).length;
  return {
    totalItems: items.length,
    itemsWithHistory: withHistory,
    itemsApproximated: flows.filter((f) => f.approximate).length,
    historyCoveragePct:
      items.length === 0 ? 0 : round((withHistory / items.length) * 100, 1),
  };
}

interface PhaseAccumulator {
  /** Every spelling seen for this column, with how often each appeared. */
  labels: Map<string, number>;
  hours: number[];
  total: number;
  reentered: number;
}

/**
 * Per-column time, keyed by *normalized* column name.
 *
 * Normalizing matters on real boards: renaming a column leaves the old
 * spelling on historical events, so "Ready for Deploy" and "Ready for deploy"
 * are one column whose stats would otherwise split in two, each with a
 * misleadingly small `n`. The most frequent spelling becomes the label.
 */
function computePhaseStats(
  flows: ItemFlow[],
  classification: StatusClassification,
): PhaseStat[] {
  const perStatus = new Map<string, PhaseAccumulator>();

  for (const flow of flows) {
    for (const [status, hours] of Object.entries(flow.hoursByStatus)) {
      // A terminal column has no meaningful duration: the item sits in "Done"
      // until somebody archives it, so time there measures age since delivery,
      // not flow. Left in, it dominates the ranking.
      if (bucketOf(status, classification) === "done") continue;

      const key = status.trim().toLowerCase();
      const entry = perStatus.get(key) ?? {
        labels: new Map<string, number>(),
        hours: [],
        total: 0,
        reentered: 0,
      };
      entry.labels.set(status, (entry.labels.get(status) ?? 0) + 1);
      entry.hours.push(hours);
      entry.total += hours;
      if ((flow.passesByStatus[status] ?? 0) > 1) entry.reentered += 1;
      perStatus.set(key, entry);
    }
  }

  return [...perStatus.entries()]
    .map(([key, entry]) => ({
      status: mostFrequentLabel(entry.labels, key),
      bucket: bucketOf(key, classification),
      n: entry.hours.length,
      medianHours: median(entry.hours),
      totalHours: round(entry.total, 2),
      reentered: entry.reentered,
    }))
    .sort((a, b) => b.totalHours - a.totalHours);
}

function mostFrequentLabel(
  labels: Map<string, number>,
  fallback: string,
): string {
  let best = fallback;
  let bestCount = -1;
  for (const [label, count] of labels) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }
  return best;
}

function computeBalance(flows: ItemFlow[]): FlowBalance[] {
  const inflow = countByWeek(
    flows.map((f) => f.enteredBoardAt).filter(isString),
  );
  const outflow = countByWeek(flows.map((f) => f.terminalAt).filter(isString));

  const weeks = [...new Set([...inflow.keys(), ...outflow.keys()])].sort();
  let cumulative = 0;
  return weeks.map((week) => {
    const inCount = inflow.get(week) ?? 0;
    const outCount = outflow.get(week) ?? 0;
    cumulative += inCount - outCount;
    return {
      week,
      inflow: inCount,
      outflow: outCount,
      cumulativeDelta: cumulative,
    };
  });
}

function computeAging(
  wipFlows: ItemFlow[],
  classification: StatusClassification,
): AgingColumn[] {
  const perStatus = new Map<string, number[]>();
  for (const flow of wipFlows) {
    if (flow.ageHours === null) continue;
    const key = flow.currentStatus ?? "(no status)";
    const list = perStatus.get(key);
    if (list) list.push(flow.ageHours);
    else perStatus.set(key, [flow.ageHours]);
  }

  return [...perStatus.entries()]
    .map(([status, ages]) => ({
      status,
      bucket: bucketOf(status, classification),
      count: ages.length,
      medianAgeHours: median(ages),
      maxAgeHours: ages.length ? round(Math.max(...ages), 2) : null,
    }))
    .sort((a, b) => (b.maxAgeHours ?? 0) - (a.maxAgeHours ?? 0));
}

/**
 * Items that have not moved in a while, worst first. The spec calls this the
 * most actionable output of the whole analysis, so it is not truncated here —
 * presentation decides how many to show.
 */
function computeStalled(wipFlows: ItemFlow[]): StalledItem[] {
  return wipFlows
    .filter(
      (f) =>
        f.hoursInCurrentStatus !== null &&
        f.hoursInCurrentStatus >= STALLED_THRESHOLD_HOURS,
    )
    .map((f) => ({
      itemId: f.itemId,
      title: f.title,
      currentStatus: f.currentStatus,
      hoursSinceLastMove: round(f.hoursInCurrentStatus ?? 0, 2),
      totalAgeHours: round(f.ageHours ?? 0, 2),
      assignees: f.assignees,
    }))
    .sort((a, b) => b.hoursSinceLastMove - a.hoursSinceLastMove);
}

/**
 * Cumulative flow: for each ISO week, how many items sat in each column at the
 * end of that week. Reconstructed from the event stream — the reason a CFD is
 * possible at all without historical snapshots.
 */
function computeCfd(flows: ItemFlow[], now: Date): CfdPoint[] {
  const starts = flows
    .map((f) => f.enteredBoardAt)
    .filter(isString)
    .map((iso) => Date.parse(iso))
    .filter((ms) => Number.isFinite(ms));

  if (starts.length === 0) return [];

  const sample = (ms: number): CfdPoint => {
    const counts: Record<string, number> = {};
    for (const flow of flows) {
      const status = statusAt(flow, ms);
      if (!status) continue;
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return { week: isoWeekKey(new Date(ms)), counts };
  };

  const points: CfdPoint[] = [];
  const end = now.getTime();
  let cursor = weekEnd(Math.min(...starts));
  while (cursor < end) {
    points.push(sample(cursor));
    cursor += WEEK_HOURS * HOUR_MS;
  }
  // The week in progress is sampled at `now` rather than at its future end,
  // so the last point reflects the board as it stands instead of stopping at
  // the previous Sunday.
  points.push(sample(end));
  return points;
}

/** Which column an item was in at instant `ms`, or null if not on the board. */
function statusAt(flow: ItemFlow, ms: number): string | null {
  let status: string | null = null;
  for (const visit of flow.visits) {
    const entered = Date.parse(visit.enteredAt);
    if (entered > ms) break;
    const exited = visit.exitedAt ? Date.parse(visit.exitedAt) : Infinity;
    status = ms < exited ? visit.status : null;
  }
  return status;
}

/**
 * Little's Law as a consistency check, not as a metric to report on its own.
 * A large gap between predicted and observed lead time usually means phantom
 * WIP or a mis-mapped terminal column — which is why both are returned.
 */
function computeLittlesLaw(flows: ItemFlow[], wip: number): LittlesLawCheck {
  const throughput = weeklyCounts(
    flows.map((f) => f.terminalAt).filter(isString),
  );
  const meanPerWeek =
    throughput.length === 0
      ? null
      : throughput.reduce((sum, w) => sum + w.count, 0) / throughput.length;

  const observed = median(flows.map((f) => f.leadTimeHours).filter(isNumber));
  const predicted =
    meanPerWeek && meanPerWeek > 0 ? (wip / meanPerWeek) * WEEK_HOURS : null;

  return {
    wip,
    throughputPerWeek: meanPerWeek === null ? null : round(meanPerWeek, 2),
    predictedLeadTimeHours: predicted === null ? null : round(predicted, 2),
    observedLeadTimeHours: observed,
    divergenceRatio:
      predicted !== null && observed !== null && observed > 0
        ? round(Math.abs(predicted - observed) / observed, 3)
        : null,
  };
}

// ---------------------------------------------------------------------------
// Statistics helpers
// ---------------------------------------------------------------------------

/**
 * Percentiles with the sample guard applied. Small samples get the median and
 * the raw values; P95 needs a real sample behind it or it is withheld.
 */
export function percentiles(values: number[]): PercentileSet {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const suppressed: string[] = [];

  if (n === 0) {
    return {
      n: 0,
      p50: null,
      p70: null,
      p85: null,
      p95: null,
      suppressed: ["p50", "p70", "p85", "p95"],
      raw: [],
    };
  }

  const p50 = quantile(sorted, 0.5);
  if (n < MIN_SAMPLE_PERCENTILES) {
    suppressed.push("p70", "p85", "p95");
    return {
      n,
      p50,
      p70: null,
      p85: null,
      p95: null,
      suppressed,
      raw: sorted.map((v) => round(v, 2)),
    };
  }

  const p95 = n >= MIN_SAMPLE_P95 ? quantile(sorted, 0.95) : null;
  if (p95 === null) suppressed.push("p95");

  return {
    n,
    p50,
    p70: quantile(sorted, 0.7),
    p85: quantile(sorted, 0.85),
    p95,
    suppressed,
    raw: sorted.map((v) => round(v, 2)),
  };
}

/** Linear-interpolation quantile over an already-sorted array. */
function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return round(sorted[0], 2);
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return round(sorted[lower], 2);
  return round(
    sorted[lower] + (pos - lower) * (sorted[upper] - sorted[lower]),
    2,
  );
}

export function median(values: number[]): number | null {
  return quantile(
    [...values].sort((a, b) => a - b),
    0.5,
  );
}

function weeklyCounts(timestamps: string[]): WeeklyCount[] {
  return [...countByWeek(timestamps).entries()]
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

function countByWeek(timestamps: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const iso of timestamps) {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) continue;
    const key = isoWeekKey(new Date(ms));
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

/** ISO-8601 week key, e.g. "2026-W34". Thursday decides the week's year. */
export function isoWeekKey(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // Shift to the Thursday of the current ISO week.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** End of the ISO week (Sunday 23:59:59.999 UTC) containing `ms`. */
function weekEnd(ms: number): number {
  const d = new Date(ms);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + (7 - day));
  d.setUTCHours(23, 59, 59, 999);
  return d.getTime();
}

function hoursBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return round(Math.max(0, (to - from) / HOUR_MS), 2);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function isString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}
