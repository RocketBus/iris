import { describe, expect, it } from "vitest";

import { readBoardConfig } from "@/lib/integrations/github-projects/sync";

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
