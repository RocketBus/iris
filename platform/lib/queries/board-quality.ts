/**
 * Data-quality gates for board flow analysis.
 *
 * These run *before* any metric is trusted, and they are not a footnote. On a
 * real board, board-setup noise — a batch of test cards created and closed
 * minutes apart — dragged the median lead time down to a fraction of a day.
 * The number was flattering and completely false.
 *
 * Every gate returns a measured value, a severity, the items responsible, and
 * a plain statement of what it does to the reading. Metrics are still computed
 * when a gate fires; they are just never shown without the caveat attached.
 *
 * Pure functions, no I/O.
 */

import type {
  BoardItemInput,
  GateSeverity,
  LifecycleBucket,
  QualityGate,
  QualityReport,
  StatusClassification,
  StatusEventInput,
} from "@/types/board-flow";

/**
 * Titles that can only be scaffolding. These fire on their own.
 *
 * Nothing here doubles as real engineering vocabulary — that distinction was
 * learned the hard way. An earlier version also matched `test`/`teste` on their
 * own and flagged three real items on a live board ("Teste não moderado nova
 * UI mobile", "Permitir teste de cenários de rebooking") while catching zero
 * actual test cards. On an engineering board, testing *is* the work.
 */
const UNAMBIGUOUS_SYNTHETIC_RE =
  /\b(dummy|lorem|asdf|qwerty|placeholder|foo|bar|baz|tbd|xxx+|test card|card de teste|delete me|ignore me)\b/i;

/**
 * Titles that *might* be scaffolding. These only count when corroborated by a
 * very short lifetime, so a real item about testing is never dropped.
 */
const WEAK_SYNTHETIC_RE =
  /\b(test|teste|testing|testando|sample|example|exemplo)\b/i;

/** A burst this size created within one minute is treated as one event. */
export const SYNTHETIC_BURST_MIN_ITEMS = 5;
/** Lifetime under which an item never represented real flow. */
export const SYNTHETIC_BURST_MAX_LIFETIME_MINUTES = 30;
/** Share of the board created-and-closed in bulk that becomes critical. */
export const MASS_IMPORT_CRITICAL_PCT = 25;

/** This many status events inside the window reads as a board tidy-up. */
export const BULK_MOVE_MIN_ITEMS = 5;
export const BULK_MOVE_WINDOW_MINUTES = 2;

/** Fraction of items carrying a field, below which cuts by it are unreliable. */
export const FIELD_COMPLETENESS_WARN_PCT = 70;
export const FIELD_COMPLETENESS_CRITICAL_PCT = 40;

/** Share of assignments held by one person, above which the board is skewed. */
export const ASSIGNEE_CONCENTRATION_WARN_PCT = 50;
export const ASSIGNEE_CONCENTRATION_CRITICAL_PCT = 75;

export const DONE_NOT_CLOSED_WARN_PCT = 10;
export const DONE_NOT_CLOSED_CRITICAL_PCT = 30;

export const HISTORY_COVERAGE_WARN_PCT = 90;
export const HISTORY_COVERAGE_CRITICAL_PCT = 60;

const MINUTE_MS = 60_000;

export function evaluateQuality(
  items: BoardItemInput[],
  events: StatusEventInput[],
  classification: StatusClassification,
): QualityReport {
  const gates: QualityGate[] = [
    syntheticItemsGate(items),
    massImportGate(items),
    doneNotClosedGate(items, classification),
    bulkMovementGate(events),
    fieldCompletenessGate(items),
    assigneeConcentrationGate(items),
    historyCoverageGate(items),
  ];

  const overall = worstSeverity(gates.map((g) => g.severity));
  return {
    gates,
    overall,
    degraded: gates.some((g) => g.severity === "critical"),
  };
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

/**
 * Synthetic items: placeholder cards left behind from setting a board up.
 *
 * Unambiguous markers fire on their own. Ambiguous ones (`test`, `sample`)
 * require a very short lifetime to corroborate, because on an engineering board
 * testing is real work — matching those words alone produced only false
 * positives on a live board.
 */
function syntheticItemsGate(items: BoardItemInput[]): QualityGate {
  const flagged = new Set<string>();

  for (const item of items) {
    if (UNAMBIGUOUS_SYNTHETIC_RE.test(item.title)) {
      flagged.add(item.id);
      continue;
    }
    if (WEAK_SYNTHETIC_RE.test(item.title) && isShortLived(item)) {
      flagged.add(item.id);
    }
  }

  const pct = percentOf(flagged.size, items.length);
  return {
    id: "synthetic_items",
    severity: flagged.size === 0 ? "ok" : pct >= 5 ? "critical" : "warning",
    value: pct,
    unit: "percent",
    affectedItemIds: [...flagged],
    summary:
      flagged.size === 0
        ? "No placeholder or scaffolding items detected."
        : `${flagged.size} item(s) (${pct}%) look like placeholder cards rather than real work. ` +
          "They cluster in the fast tail and pull the lead-time median down; exclude them before reading any duration.",
  };
}

/**
 * Bulk creation that was also bulk-completed: items created within the same
 * minute and closed minutes later.
 *
 * This is a separate finding from synthetic items, and the distinction came
 * from real data. On a live board, 91 of 198 items matched this pattern —
 * every one of them real work, imported when the board was set up. The
 * distortion is severe (a zero-day lead time for half the board, plus a
 * throughput spike in one artificial week) but the fix is different: you drop
 * these from duration analysis, you do not delete them.
 */
function massImportGate(items: BoardItemInput[]): QualityGate {
  const byMinute = new Map<string, BoardItemInput[]>();
  for (const item of items) {
    if (!item.sourceCreatedAt) continue;
    const ms = Date.parse(item.sourceCreatedAt);
    if (!Number.isFinite(ms)) continue;
    const key = String(Math.floor(ms / MINUTE_MS));
    const bucket = byMinute.get(key);
    if (bucket) bucket.push(item);
    else byMinute.set(key, [item]);
  }

  const flagged = new Set<string>();
  for (const burst of byMinute.values()) {
    if (burst.length < SYNTHETIC_BURST_MIN_ITEMS) continue;
    const shortLived = burst.filter(isShortLived);
    // A planning session legitimately creates many cards at once; only a burst
    // that was also *completed* immediately looks like an import.
    if (shortLived.length >= SYNTHETIC_BURST_MIN_ITEMS) {
      for (const item of shortLived) flagged.add(item.id);
    }
  }

  const pct = percentOf(flagged.size, items.length);
  return {
    id: "mass_import",
    severity:
      flagged.size === 0
        ? "ok"
        : pct >= MASS_IMPORT_CRITICAL_PCT
          ? "critical"
          : "warning",
    value: pct,
    unit: "percent",
    affectedItemIds: [...flagged],
    summary:
      flagged.size === 0
        ? "No bulk create-and-close pattern detected."
        : `${flagged.size} item(s) (${pct}%) were created in same-minute batches and closed within ` +
          `${SYNTHETIC_BURST_MAX_LIFETIME_MINUTES} minutes — the signature of a board import or backfill, ` +
          "not of work flowing. They carry a near-zero lead time and concentrate throughput into one " +
          "artificial week; exclude them from duration and throughput readings.",
  };
}

function isShortLived(item: BoardItemInput): boolean {
  if (!item.sourceCreatedAt || !item.sourceClosedAt) return false;
  const lifetime =
    Date.parse(item.sourceClosedAt) - Date.parse(item.sourceCreatedAt);
  return (
    Number.isFinite(lifetime) &&
    lifetime >= 0 &&
    lifetime <= SYNTHETIC_BURST_MAX_LIFETIME_MINUTES * MINUTE_MS
  );
}

/**
 * Items parked in a terminal column while their issue is still open. When this
 * is common, `closedAt` stops being a usable completion marker — which matters
 * because it is the first fallback for lead time.
 */
function doneNotClosedGate(
  items: BoardItemInput[],
  classification: StatusClassification,
): QualityGate {
  const done = items.filter(
    (item) => bucketOf(item.currentStatus, classification) === "done",
  );
  const mismatched = done.filter((item) => item.contentState === "OPEN");
  const pct = percentOf(mismatched.length, done.length);

  return {
    id: "done_not_closed",
    severity: severityFromPct(
      pct,
      DONE_NOT_CLOSED_WARN_PCT,
      DONE_NOT_CLOSED_CRITICAL_PCT,
    ),
    value: pct,
    unit: "percent",
    affectedItemIds: mismatched.map((i) => i.id),
    summary:
      mismatched.length === 0
        ? "Every item in a terminal column has its issue closed."
        : `${mismatched.length} of ${done.length} items in a terminal column still have an open issue (${pct}%). ` +
          "`closedAt` is therefore unreliable as a completion marker, and any lead time falling back to it is an estimate.",
  };
}

/**
 * Bulk movement: many status changes inside a couple of minutes. That is
 * someone tidying the board, not work flowing, and it compresses whatever
 * phase the items were sitting in.
 *
 * `wasAutomated` comes straight from GitHub, so automation-driven cascades are
 * identified rather than guessed at from identical timestamps.
 */
function bulkMovementGate(events: StatusEventInput[]): QualityGate {
  const moves = events
    .filter((e) => e.kind === "STATUS_CHANGED")
    .map((e) => ({ ...e, ms: Date.parse(e.occurredAt) }))
    .filter((e) => Number.isFinite(e.ms))
    .sort((a, b) => a.ms - b.ms);

  const windowMs = BULK_MOVE_WINDOW_MINUTES * MINUTE_MS;
  const flagged = new Set<string>();
  let automated = 0;

  let start = 0;
  for (let end = 0; end < moves.length; end++) {
    while (moves[end].ms - moves[start].ms > windowMs) start++;
    const window = moves.slice(start, end + 1);
    const distinctItems = new Set(window.map((m) => m.itemId));
    if (distinctItems.size >= BULK_MOVE_MIN_ITEMS) {
      for (const id of distinctItems) flagged.add(id);
    }
  }
  for (const move of moves) if (move.wasAutomated) automated++;

  const pct = percentOf(flagged.size, new Set(moves.map((m) => m.itemId)).size);
  return {
    id: "bulk_movement",
    severity: flagged.size === 0 ? "ok" : pct >= 25 ? "critical" : "warning",
    value: pct,
    unit: "percent",
    affectedItemIds: [...flagged],
    summary:
      flagged.size === 0
        ? "No bulk column moves detected."
        : `${flagged.size} item(s) (${pct}% of items with transitions) moved in bursts of ` +
          `${BULK_MOVE_MIN_ITEMS}+ within ${BULK_MOVE_WINDOW_MINUTES} minute(s)` +
          (automated > 0
            ? `, ${automated} of the moves flagged as automated by GitHub`
            : "") +
          ". Those transitions record board maintenance, not flow, and shorten the phases they pass through.",
  };
}

/**
 * How much of the board is actually filled in. This does not degrade the core
 * durations — it decides which *cuts* (by priority, size, iteration, owner) can
 * be trusted at all.
 */
function fieldCompletenessGate(items: BoardItemInput[]): QualityGate {
  const total = items.length;
  const filled = {
    priority: items.filter((i) => nonEmpty(i.priority)).length,
    size: items.filter((i) => nonEmpty(i.size)).length,
    iteration: items.filter((i) => nonEmpty(i.iteration)).length,
    assignee: items.filter((i) => i.assignees.length > 0).length,
  };

  const pcts = Object.entries(filled).map(
    ([field, count]) => [field, percentOf(count, total)] as const,
  );
  const worst = pcts.reduce(
    (acc, entry) => (entry[1] < acc[1] ? entry : acc),
    pcts[0] ?? (["none", 100] as const),
  );

  return {
    id: "field_completeness",
    severity: severityFromPct(
      worst[1],
      FIELD_COMPLETENESS_WARN_PCT,
      FIELD_COMPLETENESS_CRITICAL_PCT,
      /* lowerIsWorse */ true,
    ),
    value: worst[1],
    unit: "percent",
    affectedItemIds: [],
    summary:
      total === 0
        ? "No items to assess."
        : `Field completeness — ${pcts.map(([f, p]) => `${f} ${p}%`).join(", ")}. ` +
          `Cuts by ${worst[0]} rest on ${worst[1]}% of items and should not be read as representative below that.`,
  };
}

/**
 * Concentration of assignments. This is a property of the *board* — when one
 * account holds most of the cards, the board is a personal list rather than a
 * record of how the group works.
 *
 * It is explicitly not a productivity signal. Iris never ranks or scores
 * individuals (see docs/PRINCIPLES.md), and no per-person output is derived
 * from this gate: the login is not returned, only the share.
 */
function assigneeConcentrationGate(items: BoardItemInput[]): QualityGate {
  const counts = new Map<string, number>();
  let assignments = 0;
  for (const item of items) {
    for (const login of item.assignees) {
      counts.set(login, (counts.get(login) ?? 0) + 1);
      assignments++;
    }
  }

  const top = Math.max(0, ...counts.values());
  const pct = percentOf(top, assignments);
  const unassigned = items.filter((i) => i.assignees.length === 0).length;
  const unassignedPct = percentOf(unassigned, items.length);

  return {
    id: "assignee_concentration",
    severity: severityFromPct(
      pct,
      ASSIGNEE_CONCENTRATION_WARN_PCT,
      ASSIGNEE_CONCENTRATION_CRITICAL_PCT,
    ),
    value: pct,
    unit: "percent",
    affectedItemIds: [],
    summary:
      assignments === 0
        ? "No items carry an assignee, so the board says nothing about how work is distributed."
        : `The most-assigned account holds ${pct}% of all assignments, and ${unassignedPct}% of items have no owner. ` +
          "High concentration together with many unowned items means the board does not represent real workload distribution. " +
          "This describes the board, never a person's output.",
  };
}

/**
 * Share of items with real transition history. Drafts can never have it (no
 * timeline exists for them), so this is the honest ceiling on how much of the
 * board supports duration analysis at all.
 */
function historyCoverageGate(items: BoardItemInput[]): QualityGate {
  const withHistory = items.filter((i) => i.historyAvailable).length;
  const drafts = items.filter((i) => i.contentType === "DRAFT_ISSUE").length;
  const pct = percentOf(withHistory, items.length);

  return {
    id: "history_coverage",
    severity: severityFromPct(
      pct,
      HISTORY_COVERAGE_WARN_PCT,
      HISTORY_COVERAGE_CRITICAL_PCT,
      /* lowerIsWorse */ true,
    ),
    value: pct,
    unit: "percent",
    affectedItemIds: items.filter((i) => !i.historyAvailable).map((i) => i.id),
    summary:
      `${withHistory} of ${items.length} items (${pct}%) carry transition history` +
      (drafts > 0
        ? `; ${drafts} are draft items, which have no timeline on the API and can never contribute phase durations`
        : "") +
      ". Phase and lead-time figures describe only the items with history, not the whole board.",
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bucketOf(
  status: string | null,
  classification: StatusClassification,
): LifecycleBucket | null {
  if (!status) return null;
  return classification.byStatus.get(status.trim().toLowerCase()) ?? null;
}

function nonEmpty(value: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function percentOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function severityFromPct(
  pct: number,
  warnAt: number,
  criticalAt: number,
  lowerIsWorse = false,
): GateSeverity {
  if (lowerIsWorse) {
    if (pct <= criticalAt) return "critical";
    if (pct <= warnAt) return "warning";
    return "ok";
  }
  if (pct >= criticalAt) return "critical";
  if (pct >= warnAt) return "warning";
  return "ok";
}

function worstSeverity(severities: GateSeverity[]): GateSeverity {
  if (severities.includes("critical")) return "critical";
  if (severities.includes("warning")) return "warning";
  return "ok";
}
