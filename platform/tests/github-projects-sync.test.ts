import { describe, expect, it } from "vitest";

import type {
  RawProjectItem,
  RawStatusEvent,
} from "@/lib/integrations/github-projects/client";
import {
  classifyHistoryResults,
  needsHistoryFetch,
  ownerRepoFromRemoteUrl,
  readBoardConfig,
  resolveRepositoryId,
  type KnownItem,
} from "@/lib/integrations/github-projects/sync";

/**
 * `org_integrations.config` is operator-edited JSON, so the parser is the
 * boundary where a typo has to degrade into "skip this board" rather than into
 * a crashed cron run.
 */
describe("readBoardConfig", () => {
  it("reads a complete board entry", () => {
    const boards = readBoardConfig({
      boards: [
        {
          owner: "acme-inc",
          number: 12,
          ownerType: "user",
          teamSlug: "platform",
          statusConfig: { done: ["Shipped"] },
        },
      ],
    });

    expect(boards).toEqual([
      {
        owner: "acme-inc",
        number: 12,
        ownerType: "user",
        teamSlug: "platform",
        statusConfig: { done: ["Shipped"] },
      },
    ]);
  });

  it("defaults ownerType to organization and leaves the rest undefined", () => {
    const [board] = readBoardConfig({
      boards: [{ owner: "acme-inc", number: 3 }],
    });

    expect(board.ownerType).toBe("organization");
    expect(board.teamSlug).toBeUndefined();
    // No statusConfig means "classify by the generic name heuristics".
    expect(board.statusConfig).toBeUndefined();
  });

  it("skips entries missing owner or number instead of throwing", () => {
    const boards = readBoardConfig({
      boards: [
        { owner: "acme-inc" },
        { number: 7 },
        { owner: "acme-inc", number: "7" },
        null,
        "not-an-object",
        { owner: "acme-inc", number: 9 },
      ],
    });

    expect(boards).toHaveLength(1);
    expect(boards[0]).toMatchObject({ owner: "acme-inc", number: 9 });
  });

  it("returns nothing for malformed or empty config", () => {
    expect(readBoardConfig(null)).toEqual([]);
    expect(readBoardConfig({})).toEqual([]);
    expect(readBoardConfig({ boards: "nope" })).toEqual([]);
    expect(readBoardConfig({ boards: [] })).toEqual([]);
  });

  it("treats an unknown ownerType as an organization rather than guessing", () => {
    const [board] = readBoardConfig({
      boards: [{ owner: "acme-inc", number: 1, ownerType: "team" }],
    });
    expect(board.ownerType).toBe("organization");
  });
});

describe("ownerRepoFromRemoteUrl", () => {
  it("extracts owner/repo from an https remote", () => {
    expect(ownerRepoFromRemoteUrl("https://github.com/Acme/Backend.git")).toBe(
      "acme/backend",
    );
  });

  it("extracts owner/repo from an ssh remote", () => {
    expect(ownerRepoFromRemoteUrl("git@github.com:acme/backend.git")).toBe(
      "acme/backend",
    );
  });

  it("returns null for a bare name with no owner segment", () => {
    expect(ownerRepoFromRemoteUrl("backend")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(ownerRepoFromRemoteUrl(null)).toBeNull();
    expect(ownerRepoFromRemoteUrl("")).toBeNull();
  });
});

describe("resolveRepositoryId", () => {
  it("does not collide two owners that share a bare repo name", () => {
    // Regression: the old lookup keyed only by bare repo name, so a board
    // item from "acme-labs/backend" resolved to "acme/backend" whenever both
    // were tracked under the same Iris org. Both rows now carry a
    // remote_url-derived "owner/repo" key (see loadRepoLookup), so each
    // content_repo resolves to its own owner, never the other's.
    const lookup = new Map([
      ["acme/backend", "repo-acme"],
      ["acme-labs/backend", "repo-acme-labs"],
    ]);

    expect(resolveRepositoryId("acme/backend", lookup)).toBe("repo-acme");
    expect(resolveRepositoryId("acme-labs/backend", lookup)).toBe(
      "repo-acme-labs",
    );
  });

  it("falls back to bare-name matching for repos with no remote_url on file", () => {
    const lookup = new Map([["backend", "repo-legacy"]]);
    expect(resolveRepositoryId("acme/backend", lookup)).toBe("repo-legacy");
  });

  it("returns null for content with no repo", () => {
    const lookup = new Map([["acme/backend", "repo-acme"]]);
    expect(resolveRepositoryId(null, lookup)).toBeNull();
  });
});

function rawItem(overrides: Partial<RawProjectItem> = {}): RawProjectItem {
  return {
    itemId: "PVTI_1",
    contentId: "I_1",
    contentType: "ISSUE",
    contentRepo: "acme/backend",
    contentNumber: 42,
    title: "Add rate limiting",
    contentState: "OPEN",
    createdAt: "2026-03-01T00:00:00Z",
    closedAt: null,
    itemUpdatedAt: "2026-03-05T00:00:00Z",
    status: "In Progress",
    iteration: null,
    priority: null,
    size: null,
    assignees: [],
    labels: [],
    ...overrides,
  };
}

describe("needsHistoryFetch", () => {
  it("skips drafts up front — they have no timeline to read", () => {
    const item = rawItem({ contentId: null, contentType: "DRAFT_ISSUE" });
    expect(needsHistoryFetch(item, new Map(), false)).toBe(false);
  });

  it("fetches an item never seen before", () => {
    expect(needsHistoryFetch(rawItem(), new Map(), false)).toBe(true);
  });

  it("re-fetches an item whose last run never recorded history", () => {
    const known = new Map<string, KnownItem>([
      [
        "PVTI_1",
        { itemUpdatedAt: "2026-03-05T00:00:00Z", historyAvailable: false },
      ],
    ]);
    expect(needsHistoryFetch(rawItem(), known, false)).toBe(true);
  });

  it("re-fetches when the board item's updatedAt moved since last sync", () => {
    const known = new Map<string, KnownItem>([
      [
        "PVTI_1",
        { itemUpdatedAt: "2026-02-01T00:00:00Z", historyAvailable: true },
      ],
    ]);
    expect(needsHistoryFetch(rawItem(), known, false)).toBe(true);
  });

  it("skips a known, complete, unmoved item — the daily-cost guarantee", () => {
    const known = new Map<string, KnownItem>([
      [
        "PVTI_1",
        { itemUpdatedAt: "2026-03-05T00:00:00Z", historyAvailable: true },
      ],
    ]);
    expect(needsHistoryFetch(rawItem(), known, false)).toBe(false);
  });

  it("force re-fetches even a known, complete, unmoved item", () => {
    const known = new Map<string, KnownItem>([
      [
        "PVTI_1",
        { itemUpdatedAt: "2026-03-05T00:00:00Z", historyAvailable: true },
      ],
    ]);
    expect(needsHistoryFetch(rawItem(), known, true)).toBe(true);
  });
});

describe("classifyHistoryResults", () => {
  it("drops an attempted item whose content never returned a timeline", () => {
    // Regression: history_available used to be set for every item that was
    // *attempted*, regardless of whether fetchStatusHistory actually got a
    // timeline back for it. A node coming back null (content deleted
    // mid-sync) or without timelineItems leaves no entry in
    // eventsByContentId — that item's history was never really fetched.
    const attempted = [rawItem({ itemId: "PVTI_1", contentId: "I_1" })];
    const eventsByContentId = new Map<string, RawStatusEvent[]>(); // empty: I_1 never came back

    const result = classifyHistoryResults(
      attempted,
      eventsByContentId,
      new Set(),
    );

    expect(result.complete).toEqual([]);
    expect(result.truncated).toEqual([]);
  });

  it("counts an item complete once its content id has an entry, even an empty one", () => {
    const attempted = [rawItem({ itemId: "PVTI_1", contentId: "I_1" })];
    // An empty array is a real answer ("zero status events"), not a miss.
    const eventsByContentId = new Map<string, RawStatusEvent[]>([["I_1", []]]);

    const result = classifyHistoryResults(
      attempted,
      eventsByContentId,
      new Set(),
    );

    expect(result.complete).toEqual(["PVTI_1"]);
    expect(result.truncated).toEqual([]);
  });

  it("routes a fetched-but-truncated item to truncated, not complete", () => {
    const attempted = [rawItem({ itemId: "PVTI_1", contentId: "I_1" })];
    const eventsByContentId = new Map<string, RawStatusEvent[]>([["I_1", []]]);

    const result = classifyHistoryResults(
      attempted,
      eventsByContentId,
      new Set(["I_1"]),
    );

    expect(result.complete).toEqual([]);
    expect(result.truncated).toEqual(["PVTI_1"]);
  });
});
