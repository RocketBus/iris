import { describe, expect, it } from "vitest";

import {
  parseItem,
  toContentType,
  type RawItemNode,
} from "@/lib/integrations/github-projects/client";

/**
 * `client.ts` is 558 lines of parsing with no prior test coverage — the
 * pure functions here (toContentType, parseItem) are testable without I/O,
 * unlike the rest of the sync (GraphQL transport, pagination).
 */
describe("toContentType", () => {
  it("maps Issue and PullRequest typenames", () => {
    expect(toContentType({ __typename: "Issue" })).toBe("ISSUE");
    expect(toContentType({ __typename: "PullRequest" })).toBe("PULL_REQUEST");
  });

  it("maps a real DraftIssue node to DRAFT_ISSUE", () => {
    expect(toContentType({ __typename: "DraftIssue" })).toBe("DRAFT_ISSUE");
  });

  it("maps null content to UNKNOWN, not DRAFT_ISSUE", () => {
    // Regression: a deleted/transferred/inaccessible issue or PR comes back
    // as content: null, which used to fall through to the DRAFT_ISSUE
    // default — mislabeling "content is gone" as "this is a draft".
    expect(toContentType(null)).toBe("UNKNOWN");
    expect(toContentType(undefined)).toBe("UNKNOWN");
  });

  it("maps an unrecognized typename to UNKNOWN rather than guessing draft", () => {
    expect(toContentType({ __typename: "SomeFutureGithubType" })).toBe(
      "UNKNOWN",
    );
  });
});

function itemNode(overrides: Partial<RawItemNode> = {}): RawItemNode {
  return {
    id: "PVTI_1",
    type: "ISSUE",
    updatedAt: "2026-03-05T00:00:00Z",
    fieldValues: { nodes: [] },
    content: {
      __typename: "Issue",
      id: "I_1",
      number: 42,
      title: "Add rate limiting",
      state: "OPEN",
      createdAt: "2026-03-01T00:00:00Z",
      closedAt: null,
      repository: { nameWithOwner: "acme/backend" },
      assignees: { nodes: [] },
      labels: { nodes: [] },
    },
    ...overrides,
  };
}

describe("parseItem", () => {
  it("carries an issue's content id, state and repo through", () => {
    const item = parseItem(itemNode());
    expect(item.contentType).toBe("ISSUE");
    expect(item.contentId).toBe("I_1");
    expect(item.contentState).toBe("OPEN");
    expect(item.contentRepo).toBe("acme/backend");
  });

  it("gives a draft no contentId or contentState — it never had a timeline", () => {
    const item = parseItem(
      itemNode({
        content: {
          __typename: "DraftIssue",
          id: "DI_1",
          title: "Draft card",
          assignees: { nodes: [] },
        },
      }),
    );
    expect(item.contentType).toBe("DRAFT_ISSUE");
    expect(item.contentId).toBeNull();
    expect(item.contentState).toBeNull();
  });

  it("gives content: null the same shape as a draft, but tagged UNKNOWN", () => {
    // Regression: this used to parse as DRAFT_ISSUE. Functionally it still
    // gets no contentId (there is nothing to fetch history for), but the
    // *reason* reported downstream (history_coverage gate) must say "content
    // unreadable", not "this is a draft" — they call for different action.
    const item = parseItem(itemNode({ content: null }));
    expect(item.contentType).toBe("UNKNOWN");
    expect(item.contentId).toBeNull();
    expect(item.contentState).toBeNull();
    expect(item.contentRepo).toBeNull();
  });

  it("falls back to the Title field only when content itself has none", () => {
    const item = parseItem(
      itemNode({
        content: null,
        fieldValues: {
          nodes: [
            {
              __typename: "ProjectV2ItemFieldTextValue",
              text: "Field title",
              field: { name: "Title" },
            },
          ],
        },
      }),
    );
    expect(item.title).toBe("Field title");
  });

  it("uses a placeholder title when neither content nor field has one", () => {
    const item = parseItem(
      itemNode({ content: null, fieldValues: { nodes: [] } }),
    );
    expect(item.title).toBe("(untitled)");
  });
});
