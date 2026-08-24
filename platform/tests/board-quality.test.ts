import { describe, expect, it } from "vitest";

import { classifyStatuses } from "@/lib/queries/board-flow";
import {
  BULK_MOVE_MIN_ITEMS,
  SYNTHETIC_BURST_MIN_ITEMS,
  evaluateQuality,
} from "@/lib/queries/board-quality";
import type { BoardItemInput, StatusEventInput } from "@/types/board-flow";

// Fictional board, generic column names — see board-flow.test.ts.
const CLASSIFICATION = classifyStatuses({}, [
  "Backlog",
  "In Progress",
  "Code Review",
  "Done",
]);

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

function gate(items: BoardItemInput[], events: StatusEventInput[] = []) {
  const report = evaluateQuality(items, events, CLASSIFICATION);
  return (id: string) => report.gates.find((g) => g.id === id)!;
}

// ---------------------------------------------------------------------------
// Synthetic items — edge case 3
// ---------------------------------------------------------------------------

describe("synthetic_items gate", () => {
  it("stays quiet on a board of real work", () => {
    const g = gate([item(), item({ id: "b", title: "Fix checkout timeout" })]);
    expect(g("synthetic_items").severity).toBe("ok");
    expect(g("synthetic_items").value).toBe(0);
  });

  it("flags unambiguous placeholder titles on their own", () => {
    const g = gate([
      item(),
      item({ id: "b", title: "dummy card" }),
      item({ id: "c", title: "asdf" }),
    ]);
    const result = g("synthetic_items");
    expect(result.affectedItemIds.sort()).toEqual(["b", "c"]);
    expect(result.severity).toBe("critical");
  });

  /**
   * Regression guard from a live board: an earlier version matched `test` and
   * `teste` on their own, flagged three real engineering items, and caught zero
   * actual placeholder cards. On an engineering board, testing is the work.
   */
  it("does not flag real work that merely mentions testing", () => {
    const items = [
      item({ id: "a", title: "Teste não moderado nova UI mobile + cupons" }),
      item({ id: "b", title: "Permitir teste de cenários de rebooking" }),
      item({ id: "c", title: "Finalizar teste de pagamento combinado" }),
      item({ id: "d", title: "Add integration tests to the booking service" }),
    ];

    const result = gate(items)("synthetic_items");
    expect(result.affectedItemIds).toEqual([]);
    expect(result.severity).toBe("ok");
  });

  it("flags an ambiguous title only when a short lifetime corroborates it", () => {
    const longLived = item({ id: "long", title: "teste de carga" });
    const shortLived = item({
      id: "short",
      title: "teste de carga",
      sourceCreatedAt: "2026-03-01T10:00:00Z",
      sourceClosedAt: "2026-03-01T10:02:00Z",
    });

    expect(gate([longLived])("synthetic_items").affectedItemIds).toEqual([]);
    expect(gate([shortLived])("synthetic_items").affectedItemIds).toEqual([
      "short",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Mass import — edge case 3
// ---------------------------------------------------------------------------

describe("mass_import gate", () => {
  it("flags a same-minute burst that was also closed within minutes", () => {
    // Nine cards created together and closed 25 minutes later: a board import,
    // not delivery. Left in, they collapse the lead-time median.
    const burst = Array.from({ length: 9 }, (_, i) =>
      item({
        id: `burst-${i}`,
        title: `Card ${i}`,
        sourceCreatedAt: "2026-03-01T10:00:00Z",
        sourceClosedAt: "2026-03-01T10:25:00Z",
        currentStatus: "Done",
        contentState: "CLOSED",
      }),
    );

    const result = gate([...burst, item({ id: "real" })])("mass_import");
    expect(result.affectedItemIds).toHaveLength(9);
    expect(result.severity).toBe("critical");
    expect(result.summary).toContain("import or backfill");
  });

  it("does not flag a planning session that creates many cards at once", () => {
    // Same burst shape, but the cards live on — that is grooming, not import.
    const burst = Array.from(
      { length: SYNTHETIC_BURST_MIN_ITEMS + 4 },
      (_, i) =>
        item({
          id: `plan-${i}`,
          title: `Story ${i}`,
          sourceCreatedAt: "2026-03-01T10:00:00Z",
          sourceClosedAt: null,
        }),
    );

    expect(gate(burst)("mass_import").severity).toBe("ok");
  });

  it("keeps imported items separate from placeholder items", () => {
    // The two findings call for different actions: you delete a placeholder,
    // you exclude an import from duration analysis.
    const burst = Array.from({ length: SYNTHETIC_BURST_MIN_ITEMS }, (_, i) =>
      item({
        id: `imported-${i}`,
        title: `BUSV-${i}: real delivered work`,
        sourceCreatedAt: "2026-03-01T10:00:00Z",
        sourceClosedAt: "2026-03-01T10:05:00Z",
      }),
    );

    const g = gate(burst);
    expect(g("mass_import").affectedItemIds).toHaveLength(
      SYNTHETIC_BURST_MIN_ITEMS,
    );
    expect(g("synthetic_items").affectedItemIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Done but not closed — edge case 2
// ---------------------------------------------------------------------------

describe("done_not_closed gate", () => {
  it("passes when every terminal item is closed", () => {
    const g = gate([
      item({ currentStatus: "Done", contentState: "CLOSED" }),
      item({ id: "b", currentStatus: "Done", contentState: "CLOSED" }),
    ]);
    expect(g("done_not_closed").severity).toBe("ok");
  });

  it("fires when a Done item still has an open issue", () => {
    const g = gate([
      item({ id: "a", currentStatus: "Done", contentState: "OPEN" }),
      item({ id: "b", currentStatus: "Done", contentState: "CLOSED" }),
    ]);
    const result = g("done_not_closed");
    expect(result.value).toBe(50);
    expect(result.severity).toBe("critical");
    expect(result.affectedItemIds).toEqual(["a"]);
    expect(result.summary).toContain("closedAt");
  });

  it("ignores non-terminal items entirely", () => {
    const g = gate([
      item({ currentStatus: "In Progress", contentState: "OPEN" }),
    ]);
    expect(g("done_not_closed").value).toBe(0);
    expect(g("done_not_closed").severity).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// Bulk movement — edge case 6
// ---------------------------------------------------------------------------

describe("bulk_movement gate", () => {
  it("stays quiet when moves are spread out", () => {
    const events: StatusEventInput[] = Array.from({ length: 6 }, (_, i) => ({
      itemId: `item-${i}`,
      kind: "STATUS_CHANGED",
      previousStatus: "Backlog",
      status: "In Progress",
      occurredAt: new Date(Date.UTC(2026, 2, 1 + i, 9)).toISOString(),
      wasAutomated: false,
    }));

    const g = gate([], events);
    expect(g("bulk_movement").severity).toBe("ok");
  });

  it("flags many items moved inside the same couple of minutes", () => {
    const events: StatusEventInput[] = Array.from(
      { length: BULK_MOVE_MIN_ITEMS + 3 },
      (_, i) => ({
        itemId: `item-${i}`,
        kind: "STATUS_CHANGED" as const,
        previousStatus: "Backlog",
        status: "Done",
        occurredAt: new Date(Date.UTC(2026, 2, 1, 9, 0, i * 5)).toISOString(),
        wasAutomated: false,
      }),
    );

    const result = gate([], events)("bulk_movement");
    expect(result.affectedItemIds).toHaveLength(BULK_MOVE_MIN_ITEMS + 3);
    expect(result.severity).toBe("critical");
    expect(result.summary).toContain("board maintenance");
  });

  it("credits GitHub's own automation flag in the summary", () => {
    const events: StatusEventInput[] = Array.from(
      { length: BULK_MOVE_MIN_ITEMS },
      (_, i) => ({
        itemId: `item-${i}`,
        kind: "STATUS_CHANGED" as const,
        previousStatus: "Code Review",
        status: "Done",
        occurredAt: new Date(Date.UTC(2026, 2, 1, 9, 0, i)).toISOString(),
        wasAutomated: true,
      }),
    );

    expect(gate([], events)("bulk_movement").summary).toContain("automated");
  });
});

// ---------------------------------------------------------------------------
// Field completeness
// ---------------------------------------------------------------------------

describe("field_completeness gate", () => {
  it("reports the weakest field and what it limits", () => {
    const items = [
      item({ id: "a", priority: null, size: null }),
      item({ id: "b", priority: null, size: "M" }),
    ];
    const result = gate(items)("field_completeness");

    expect(result.value).toBe(0);
    expect(result.severity).toBe("critical");
    expect(result.summary).toContain("priority 0%");
  });

  it("passes a well-filled board", () => {
    expect(
      gate([item(), item({ id: "b" })])("field_completeness").severity,
    ).toBe("ok");
  });

  it("does not crash on an empty board", () => {
    expect(gate([])("field_completeness").summary).toContain("No items");
  });
});

// ---------------------------------------------------------------------------
// Assignee concentration
// ---------------------------------------------------------------------------

describe("assignee_concentration gate", () => {
  it("reads concentration as a board property, not a person's output", () => {
    const items = [
      item({ id: "a", assignees: ["dev-a"] }),
      item({ id: "b", assignees: ["dev-a"] }),
      item({ id: "c", assignees: ["dev-a"] }),
      item({ id: "d", assignees: [] }),
    ];
    const result = gate(items)("assignee_concentration");

    expect(result.value).toBe(100);
    expect(result.severity).toBe("critical");
    // No login is ever returned — only the share.
    expect(result.summary).not.toContain("dev-a");
    expect(result.summary).toContain("never a person");
    expect(result.affectedItemIds).toEqual([]);
  });

  it("says so plainly when nothing is assigned", () => {
    const result = gate([item({ assignees: [] })])("assignee_concentration");
    expect(result.summary).toContain("No items carry an assignee");
  });

  it("passes when work is spread across people", () => {
    const items = [
      item({ id: "a", assignees: ["dev-a"] }),
      item({ id: "b", assignees: ["dev-b"] }),
      item({ id: "c", assignees: ["dev-c"] }),
      item({ id: "d", assignees: ["dev-d"] }),
    ];
    expect(gate(items)("assignee_concentration").severity).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// History coverage — edge cases 1 and 5
// ---------------------------------------------------------------------------

describe("history_coverage gate", () => {
  it("is critical on a first run where nothing has history yet", () => {
    const items = [
      item({ id: "a", historyAvailable: false }),
      item({ id: "b", historyAvailable: false }),
    ];
    const result = gate(items)("history_coverage");

    expect(result.value).toBe(0);
    expect(result.severity).toBe("critical");
    expect(result.affectedItemIds.sort()).toEqual(["a", "b"]);
  });

  it("explains that drafts can never contribute durations", () => {
    const items = [
      item({ id: "a" }),
      item({
        id: "b",
        contentType: "DRAFT_ISSUE",
        contentState: null,
        historyAvailable: false,
      }),
    ];
    const result = gate(items)("history_coverage");

    expect(result.value).toBe(50);
    expect(result.summary).toContain("draft");
    expect(result.summary).toContain("no timeline");
  });

  it("passes when the whole board carries history", () => {
    expect(gate([item(), item({ id: "b" })])("history_coverage").severity).toBe(
      "ok",
    );
  });
});

// ---------------------------------------------------------------------------
// Report roll-up
// ---------------------------------------------------------------------------

describe("evaluateQuality", () => {
  it("rolls the worst gate up and marks the report degraded", () => {
    const report = evaluateQuality(
      [item({ currentStatus: "Done", contentState: "OPEN" })],
      [],
      CLASSIFICATION,
    );

    expect(report.overall).toBe("critical");
    expect(report.degraded).toBe(true);
    expect(report.gates).toHaveLength(7);
  });

  it("reports a clean board as not degraded", () => {
    const items = [
      item({ id: "a", assignees: ["dev-a"] }),
      item({ id: "b", assignees: ["dev-b"] }),
      item({ id: "c", assignees: ["dev-c"] }),
      item({ id: "d", assignees: ["dev-d"] }),
    ];
    const report = evaluateQuality(items, [], CLASSIFICATION);

    expect(report.degraded).toBe(false);
    expect(report.overall).toBe("ok");
  });
});
