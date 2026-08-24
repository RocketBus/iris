import { describe, expect, it } from "vitest";

import {
  MIN_SAMPLE_P95,
  MIN_SAMPLE_PERCENTILES,
  buildItemFlow,
  classifyStatuses,
  isoWeekKey,
  percentiles,
  summarizeBoard,
} from "@/lib/queries/board-flow";
import type { BoardItemInput, StatusEventInput } from "@/types/board-flow";

// ---------------------------------------------------------------------------
// Fixtures
//
// Fictional board with a generic column vocabulary. Nothing here mirrors a
// particular organization's workflow — the point is that the module works off
// whatever column names it is handed.
// ---------------------------------------------------------------------------

const NOW = new Date("2026-03-20T00:00:00Z");

function item(overrides: Partial<BoardItemInput> = {}): BoardItemInput {
  return {
    id: "item-1",
    title: "Add rate limiting to the public API",
    contentType: "ISSUE",
    currentStatus: "In Progress",
    contentState: "OPEN",
    sourceCreatedAt: "2026-03-01T09:00:00Z",
    sourceClosedAt: null,
    itemUpdatedAt: "2026-03-05T09:00:00Z",
    assignees: ["dev-a"],
    labels: [],
    iteration: "Sprint 7",
    priority: "P2",
    size: "M",
    historyAvailable: true,
    ...overrides,
  };
}

function event(overrides: Partial<StatusEventInput> = {}): StatusEventInput {
  return {
    itemId: "item-1",
    kind: "STATUS_CHANGED",
    previousStatus: "",
    status: "Backlog",
    occurredAt: "2026-03-01T09:00:00Z",
    wasAutomated: false,
    ...overrides,
  };
}

const CLASSIFICATION = classifyStatuses({}, [
  "Backlog",
  "Discovery",
  "Ready for Development",
  "In Progress",
  "Code Review",
  "Done",
]);

// ---------------------------------------------------------------------------
// classifyStatuses
// ---------------------------------------------------------------------------

describe("classifyStatuses", () => {
  it("maps generic column vocabularies without configuration", () => {
    const c = classifyStatuses({}, [
      "Backlog",
      "Discovery",
      "In Progress",
      "Code Review",
      "Done",
    ]);
    expect(c.byStatus.get("backlog")).toBe("backlog");
    expect(c.byStatus.get("discovery")).toBe("discovery");
    expect(c.byStatus.get("in progress")).toBe("active");
    expect(c.byStatus.get("code review")).toBe("active");
    expect(c.byStatus.get("done")).toBe("done");
    expect(c.unmapped).toEqual([]);
  });

  it("treats a 'Ready for ...' column as a queue, not as active work", () => {
    // Folding queues into active would inflate flow efficiency, whose entire
    // job is exposing waiting.
    const c = classifyStatuses({}, [
      "Ready for Development",
      "Ready for Deploy",
    ]);
    expect(c.byStatus.get("ready for development")).toBe("queue");
    expect(c.byStatus.get("ready for deploy")).toBe("queue");
  });

  it("lets explicit per-board config override the heuristics", () => {
    const c = classifyStatuses({ active: ["Parking Lot"] }, ["Parking Lot"]);
    expect(c.byStatus.get("parking lot")).toBe("active");
    expect(c.unmapped).toEqual([]);
  });

  // Edge case 8: custom columns matching no configured state.
  it("reports unrecognised columns instead of silently swallowing them", () => {
    const c = classifyStatuses({}, ["Backlog", "Zephyr", "Quadrant Two"]);
    expect(c.unmapped).toEqual(["Zephyr", "Quadrant Two"]);
    expect(c.byStatus.has("zephyr")).toBe(false);
  });

  it("is case- and whitespace-insensitive", () => {
    const c = classifyStatuses({ done: ["  SHIPPED  "] }, ["shipped"]);
    expect(c.byStatus.get("shipped")).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// buildItemFlow
// ---------------------------------------------------------------------------

describe("buildItemFlow", () => {
  // Edge case 1: first run, nothing recorded yet.
  it("never invents a duration for an item with no events", () => {
    const flow = buildItemFlow(item(), [], CLASSIFICATION, NOW);

    expect(flow.visits).toEqual([]);
    expect(flow.leadTimeHours).toBeNull();
    expect(flow.leadTimeSource).toBeNull();
    expect(flow.cycleTimeHours).toBeNull();
    expect(flow.activeHours).toBe(0);
    expect(flow.isTerminal).toBe(false);
    // Board entry falls back to the issue's creation date, which is real data.
    expect(flow.enteredBoardAt).toBe("2026-03-01T09:00:00Z");
  });

  it("computes exact per-phase durations from transitions", () => {
    const events: StatusEventInput[] = [
      event({ kind: "ADDED", previousStatus: null, status: null }),
      event({ status: "Backlog" }),
      event({
        previousStatus: "Backlog",
        status: "In Progress",
        occurredAt: "2026-03-03T09:00:00Z",
      }),
      event({
        previousStatus: "In Progress",
        status: "Done",
        occurredAt: "2026-03-05T09:00:00Z",
      }),
    ];

    const flow = buildItemFlow(
      item({ currentStatus: "Done", contentState: "CLOSED" }),
      events,
      CLASSIFICATION,
      NOW,
    );

    expect(flow.hoursByStatus["Backlog"]).toBe(48);
    expect(flow.hoursByStatus["In Progress"]).toBe(48);
    expect(flow.leadTimeSource).toBe("transitions");
    expect(flow.leadTimeHours).toBe(96);
    expect(flow.terminalAt).toBe("2026-03-05T09:00:00Z");
    expect(flow.isTerminal).toBe(true);
    expect(flow.activeHours).toBe(48);
    expect(flow.cycleTimeHours).toBe(48);
    expect(flow.flowEfficiency).toBe(0.5);
    expect(flow.approximate).toBe(false);
  });

  // Edge case 7: an item that goes backwards must accumulate both visits.
  it("accumulates time across re-entry into the same column", () => {
    const events: StatusEventInput[] = [
      event({ status: "In Progress" }),
      event({
        previousStatus: "In Progress",
        status: "Backlog",
        occurredAt: "2026-03-02T09:00:00Z",
      }),
      event({
        previousStatus: "Backlog",
        status: "In Progress",
        occurredAt: "2026-03-04T09:00:00Z",
      }),
      event({
        previousStatus: "In Progress",
        status: "Done",
        occurredAt: "2026-03-05T09:00:00Z",
      }),
    ];

    const flow = buildItemFlow(item(), events, CLASSIFICATION, NOW);

    // 24h on the first pass + 24h on the second — not overwritten.
    expect(flow.hoursByStatus["In Progress"]).toBe(48);
    expect(flow.passesByStatus["In Progress"]).toBe(2);
    expect(flow.visits.filter((v) => v.status === "In Progress")).toHaveLength(
      2,
    );
  });

  it("falls back to closedAt and marks the result approximate", () => {
    const flow = buildItemFlow(
      item({
        historyAvailable: false,
        sourceClosedAt: "2026-03-04T09:00:00Z",
        currentStatus: "Done",
        contentState: "CLOSED",
      }),
      [],
      CLASSIFICATION,
      NOW,
    );

    expect(flow.leadTimeSource).toBe("closed_at");
    expect(flow.leadTimeHours).toBe(72);
    expect(flow.approximate).toBe(true);
  });

  it("does not use updatedAt as a lead time for an item that never finished", () => {
    // updatedAt moves on any edit; treating it as completion would fabricate
    // a lead time for work still in flight.
    const flow = buildItemFlow(
      item({ historyAvailable: false, itemUpdatedAt: "2026-03-10T09:00:00Z" }),
      [],
      CLASSIFICATION,
      NOW,
    );

    expect(flow.leadTimeHours).toBeNull();
    expect(flow.leadTimeSource).toBeNull();
  });

  // Edge case 5: a draft has no timeline at all.
  it("yields no phase durations for a draft item", () => {
    const flow = buildItemFlow(
      item({
        contentType: "DRAFT_ISSUE",
        contentState: null,
        sourceClosedAt: null,
        historyAvailable: false,
      }),
      [],
      CLASSIFICATION,
      NOW,
    );

    expect(flow.visits).toEqual([]);
    expect(flow.leadTimeHours).toBeNull();
    expect(flow.activeHours).toBe(0);
  });

  // Edge case 4: created == updated, untouched for weeks.
  it("ages an untouched in-flight item from its board entry", () => {
    const flow = buildItemFlow(
      item({
        sourceCreatedAt: "2026-02-27T00:00:00Z",
        itemUpdatedAt: "2026-02-27T00:00:00Z",
      }),
      [event({ status: "In Progress", occurredAt: "2026-02-27T00:00:00Z" })],
      CLASSIFICATION,
      NOW,
    );

    expect(flow.isTerminal).toBe(false);
    expect(flow.ageHours).toBe(21 * 24);
    expect(flow.hoursInCurrentStatus).toBe(21 * 24);
  });

  it("treats removal from the board as an exit, never as completion", () => {
    const events: StatusEventInput[] = [
      event({ status: "In Progress" }),
      event({
        kind: "REMOVED",
        previousStatus: null,
        status: null,
        occurredAt: "2026-03-02T09:00:00Z",
      }),
    ];

    const flow = buildItemFlow(item(), events, CLASSIFICATION, NOW);

    expect(flow.removedFromBoard).toBe(true);
    expect(flow.isTerminal).toBe(false);
    expect(flow.terminalAt).toBeNull();
    // The open visit is closed at removal, not left running to now.
    expect(flow.hoursByStatus["In Progress"]).toBe(24);
  });

  it("orders events defensively rather than trusting input order", () => {
    const events: StatusEventInput[] = [
      event({
        previousStatus: "Backlog",
        status: "Done",
        occurredAt: "2026-03-05T09:00:00Z",
      }),
      event({ status: "Backlog", occurredAt: "2026-03-01T09:00:00Z" }),
    ];

    const flow = buildItemFlow(item(), events, CLASSIFICATION, NOW);
    expect(flow.hoursByStatus["Backlog"]).toBe(96);
    expect(flow.terminalAt).toBe("2026-03-05T09:00:00Z");
  });
});

// ---------------------------------------------------------------------------
// percentiles
// ---------------------------------------------------------------------------

describe("percentiles", () => {
  it("returns nothing for an empty sample", () => {
    const p = percentiles([]);
    expect(p.n).toBe(0);
    expect(p.p50).toBeNull();
    expect(p.suppressed).toContain("p50");
  });

  it("gives only the median and the raw strip below the small-sample floor", () => {
    const p = percentiles([1, 2, 3, 4, 5, 6]);
    expect(p.n).toBe(6);
    expect(p.p50).toBe(3.5);
    expect(p.p95).toBeNull();
    expect(p.p85).toBeNull();
    expect(p.suppressed).toEqual(["p70", "p85", "p95"]);
    expect(p.raw).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("withholds P95 until the sample can support it", () => {
    const sample = Array.from({ length: MIN_SAMPLE_P95 - 1 }, (_, i) => i + 1);
    const p = percentiles(sample);
    expect(p.n).toBeGreaterThanOrEqual(MIN_SAMPLE_PERCENTILES);
    expect(p.p85).not.toBeNull();
    expect(p.p95).toBeNull();
    expect(p.suppressed).toEqual(["p95"]);
  });

  it("reports every percentile once the sample is large enough", () => {
    const sample = Array.from({ length: MIN_SAMPLE_P95 }, (_, i) => i + 1);
    const p = percentiles(sample);
    expect(p.p50).not.toBeNull();
    expect(p.p95).not.toBeNull();
    expect(p.suppressed).toEqual([]);
  });
});

describe("isoWeekKey", () => {
  it("keys by ISO week, with Thursday deciding the year", () => {
    expect(isoWeekKey(new Date("2026-03-18T12:00:00Z"))).toBe("2026-W12");
    // 1 Jan 2027 is a Friday, so it belongs to the last ISO week of 2026.
    expect(isoWeekKey(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
  });
});

// ---------------------------------------------------------------------------
// summarizeBoard
// ---------------------------------------------------------------------------

describe("summarizeBoard", () => {
  it("summarises a small board end to end", () => {
    const items: BoardItemInput[] = [
      item({ id: "a", currentStatus: "Done", contentState: "CLOSED" }),
      item({ id: "b", currentStatus: "In Progress" }),
      item({
        id: "c",
        contentType: "DRAFT_ISSUE",
        contentState: null,
        currentStatus: "Backlog",
        historyAvailable: false,
      }),
    ];

    const events: StatusEventInput[] = [
      event({ itemId: "a", status: "Backlog" }),
      event({
        itemId: "a",
        previousStatus: "Backlog",
        status: "In Progress",
        occurredAt: "2026-03-02T09:00:00Z",
      }),
      event({
        itemId: "a",
        previousStatus: "In Progress",
        status: "Done",
        occurredAt: "2026-03-04T09:00:00Z",
      }),
      event({
        itemId: "b",
        status: "In Progress",
        occurredAt: "2026-03-10T09:00:00Z",
      }),
    ];

    const summary = summarizeBoard(items, events, {
      boardId: "board-1",
      title: "Team Alpha",
      teamSlug: "team-alpha",
      now: NOW,
    });

    expect(summary.coverage.totalItems).toBe(3);
    expect(summary.coverage.itemsWithHistory).toBe(2);
    expect(summary.coverage.historyCoveragePct).toBe(66.7);

    // Only the finished item has a lead time; the draft contributes nothing.
    expect(summary.leadTime.n).toBe(1);
    expect(summary.leadTime.p50).toBe(72);

    // WIP excludes the terminal item; the draft counts (it is on the board).
    expect(summary.wip).toBe(2);
    expect(summary.throughput).toEqual([{ week: "2026-W10", count: 1 }]);
    expect(summary.unmappedStatuses).toEqual([]);
  });

  it("reports phase stats with a per-column sample size", () => {
    const items = [
      item({ id: "a", currentStatus: "Done" }),
      item({ id: "b", currentStatus: "Done" }),
    ];
    const events: StatusEventInput[] = [
      event({ itemId: "a", status: "In Progress" }),
      event({
        itemId: "a",
        previousStatus: "In Progress",
        status: "Done",
        occurredAt: "2026-03-02T09:00:00Z",
      }),
      event({ itemId: "b", status: "In Progress" }),
      event({
        itemId: "b",
        previousStatus: "In Progress",
        status: "Done",
        occurredAt: "2026-03-04T09:00:00Z",
      }),
    ];

    const summary = summarizeBoard(items, events, {
      boardId: "board-1",
      title: "Team Alpha",
      now: NOW,
    });

    const inProgress = summary.phases.find((p) => p.status === "In Progress");
    expect(inProgress?.n).toBe(2);
    expect(inProgress?.medianHours).toBe(48);
    expect(inProgress?.bucket).toBe("active");
    expect(inProgress?.reentered).toBe(0);
  });

  /**
   * From a live board: a renamed column leaves the old spelling on historical
   * events, so "Ready for Deploy" and "Ready for deploy" arrived as two rows
   * with a misleadingly small `n` each.
   */
  it("merges spellings of a renamed column into one phase", () => {
    const items = [
      item({ id: "a", currentStatus: "Done" }),
      item({ id: "b", currentStatus: "Done" }),
      item({ id: "c", currentStatus: "Done" }),
    ];
    const events: StatusEventInput[] = [
      // Two items moved through the old spelling, one through the new.
      event({ itemId: "a", status: "Ready for deploy" }),
      event({
        itemId: "a",
        previousStatus: "Ready for deploy",
        status: "Done",
        occurredAt: "2026-03-02T09:00:00Z",
      }),
      event({ itemId: "b", status: "Ready for deploy" }),
      event({
        itemId: "b",
        previousStatus: "Ready for deploy",
        status: "Done",
        occurredAt: "2026-03-02T09:00:00Z",
      }),
      event({ itemId: "c", status: "Ready for Deploy" }),
      event({
        itemId: "c",
        previousStatus: "Ready for Deploy",
        status: "Done",
        occurredAt: "2026-03-03T09:00:00Z",
      }),
    ];

    const summary = summarizeBoard(items, events, {
      boardId: "board-1",
      title: "Team Alpha",
      now: NOW,
    });

    const queues = summary.phases.filter((p) => p.bucket === "queue");
    expect(queues).toHaveLength(1);
    expect(queues[0].n).toBe(3);
    // The most frequent spelling wins the label.
    expect(queues[0].status).toBe("Ready for deploy");
  });

  it("excludes the terminal column from time-per-phase", () => {
    // An item sits in Done until archived, so its time there measures age
    // since delivery. Left in, it dominates the ranking.
    const items = [item({ id: "a", currentStatus: "Done" })];
    const events: StatusEventInput[] = [
      event({ itemId: "a", status: "In Progress" }),
      event({
        itemId: "a",
        previousStatus: "In Progress",
        status: "Done",
        occurredAt: "2026-03-02T09:00:00Z",
      }),
    ];

    const summary = summarizeBoard(items, events, {
      boardId: "board-1",
      title: "Team Alpha",
      now: NOW,
    });

    expect(summary.phases.map((p) => p.status)).toEqual(["In Progress"]);
    // The raw per-item accumulation still records it; only the board-level
    // phase ranking drops it.
    expect(summary.leadTime.p50).toBe(24);
  });

  it("tracks inflow against outflow and the cumulative backlog delta", () => {
    const items = [
      item({ id: "a", currentStatus: "Done" }),
      item({ id: "b", currentStatus: "Backlog" }),
      item({ id: "c", currentStatus: "Backlog" }),
    ];
    const events: StatusEventInput[] = [
      event({
        itemId: "a",
        status: "Backlog",
        occurredAt: "2026-03-02T09:00:00Z",
      }),
      event({
        itemId: "a",
        previousStatus: "Backlog",
        status: "Done",
        occurredAt: "2026-03-03T09:00:00Z",
      }),
      event({
        itemId: "b",
        status: "Backlog",
        occurredAt: "2026-03-04T09:00:00Z",
      }),
      event({
        itemId: "c",
        status: "Backlog",
        occurredAt: "2026-03-05T09:00:00Z",
      }),
    ];

    const summary = summarizeBoard(items, events, {
      boardId: "board-1",
      title: "Team Alpha",
      now: NOW,
    });

    // Three arrived, one left, in the same ISO week.
    expect(summary.balance).toEqual([
      { week: "2026-W10", inflow: 3, outflow: 1, cumulativeDelta: 2 },
    ]);
  });

  it("lists stalled items worst-first and never counts terminal ones", () => {
    const items = [
      item({ id: "stuck", currentStatus: "Code Review" }),
      item({ id: "fresh", currentStatus: "In Progress" }),
      item({ id: "shipped", currentStatus: "Done" }),
    ];
    const events: StatusEventInput[] = [
      event({
        itemId: "stuck",
        status: "Code Review",
        occurredAt: "2026-02-01T00:00:00Z",
      }),
      event({
        itemId: "fresh",
        status: "In Progress",
        occurredAt: "2026-03-19T00:00:00Z",
      }),
      event({
        itemId: "shipped",
        status: "Done",
        occurredAt: "2026-01-01T00:00:00Z",
      }),
    ];

    const summary = summarizeBoard(items, events, {
      boardId: "board-1",
      title: "Team Alpha",
      now: NOW,
    });

    expect(summary.stalled.map((s) => s.itemId)).toEqual(["stuck"]);
    expect(summary.stalled[0].currentStatus).toBe("Code Review");
    expect(summary.stalled[0].assignees).toEqual(["dev-a"]);
  });

  it("builds a cumulative flow series from the event stream", () => {
    const items = [item({ id: "a", currentStatus: "Done" })];
    const events: StatusEventInput[] = [
      event({
        itemId: "a",
        status: "Backlog",
        occurredAt: "2026-03-02T09:00:00Z",
      }),
      event({
        itemId: "a",
        previousStatus: "Backlog",
        status: "Done",
        occurredAt: "2026-03-16T09:00:00Z",
      }),
    ];

    const summary = summarizeBoard(items, events, {
      boardId: "board-1",
      title: "Team Alpha",
      now: NOW,
    });

    expect(summary.cfd.length).toBeGreaterThan(1);
    expect(summary.cfd[0].counts).toEqual({ Backlog: 1 });
    expect(summary.cfd[summary.cfd.length - 1].counts).toEqual({ Done: 1 });
  });

  it("returns Little's Law alongside the observed lead time, not instead of it", () => {
    const items = [
      item({ id: "a", currentStatus: "Done" }),
      item({ id: "b", currentStatus: "In Progress" }),
    ];
    const events: StatusEventInput[] = [
      event({ itemId: "a", status: "Backlog" }),
      event({
        itemId: "a",
        previousStatus: "Backlog",
        status: "Done",
        occurredAt: "2026-03-03T09:00:00Z",
      }),
      event({
        itemId: "b",
        status: "In Progress",
        occurredAt: "2026-03-02T09:00:00Z",
      }),
    ];

    const summary = summarizeBoard(items, events, {
      boardId: "board-1",
      title: "Team Alpha",
      now: NOW,
    });

    expect(summary.littlesLaw.wip).toBe(1);
    expect(summary.littlesLaw.throughputPerWeek).toBe(1);
    expect(summary.littlesLaw.predictedLeadTimeHours).toBe(168);
    expect(summary.littlesLaw.observedLeadTimeHours).toBe(48);
    expect(summary.littlesLaw.divergenceRatio).toBe(2.5);
  });

  /**
   * The UI groups the cumulative-flow diagram by bucket rather than by column —
   * a real board carries a dozen-plus columns and stacking that many bands is
   * unreadable. That grouping needs the resolved bucket per column.
   */
  it("exposes the resolved bucket for every column seen", () => {
    const items = [item({ id: "a", currentStatus: "Done" })];
    const events: StatusEventInput[] = [
      event({ itemId: "a", status: "Ready for Development" }),
      event({
        itemId: "a",
        previousStatus: "Ready for Development",
        status: "Done",
        occurredAt: "2026-03-02T09:00:00Z",
      }),
    ];

    const summary = summarizeBoard(items, events, {
      boardId: "board-1",
      title: "Team Alpha",
      now: NOW,
    });

    expect(summary.statusBuckets).toEqual({
      "Ready for Development": "queue",
      Done: "done",
    });
  });

  it("omits unmapped columns from the bucket map", () => {
    const items = [item({ id: "a", currentStatus: "Zephyr" })];
    const summary = summarizeBoard(
      items,
      [event({ itemId: "a", status: "Zephyr" })],
      { boardId: "board-1", title: "Team Alpha", now: NOW },
    );

    expect(summary.statusBuckets).toEqual({});
    expect(summary.unmappedStatuses).toEqual(["Zephyr"]);
  });

  it("handles an empty board without throwing", () => {
    const summary = summarizeBoard([], [], {
      boardId: "board-1",
      title: "Team Alpha",
      now: NOW,
    });

    expect(summary.coverage.totalItems).toBe(0);
    expect(summary.leadTime.n).toBe(0);
    expect(summary.wip).toBe(0);
    expect(summary.cfd).toEqual([]);
    expect(summary.littlesLaw.throughputPerWeek).toBeNull();
  });
});
