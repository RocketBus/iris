import { describe, expect, it } from "vitest";

import { __testing } from "@/lib/integrations/datadog/sync";

const {
  normalizeRepoSlug,
  oldestStartedAt,
  normalizeNullableIso,
  uniqueByKey,
} = __testing;

describe("normalizeRepoSlug", () => {
  it("returns null for empty input", () => {
    expect(normalizeRepoSlug(null)).toBeNull();
    expect(normalizeRepoSlug(undefined)).toBeNull();
    expect(normalizeRepoSlug("")).toBeNull();
    expect(normalizeRepoSlug("   ")).toBeNull();
  });

  it("normalizes a Datadog slug verbatim", () => {
    expect(normalizeRepoSlug("github.com/rocketbus/search")).toBe(
      "github.com/rocketbus/search",
    );
  });

  it("strips https scheme and .git suffix", () => {
    expect(normalizeRepoSlug("https://github.com/RocketBus/search.git")).toBe(
      "github.com/rocketbus/search",
    );
  });

  it("converts ssh git@host:org/repo to host/org/repo", () => {
    expect(normalizeRepoSlug("git@github.com:RocketBus/search.git")).toBe(
      "github.com/rocketbus/search",
    );
  });

  it("handles ssh:// scheme", () => {
    expect(normalizeRepoSlug("ssh://git@github.com/RocketBus/search.git")).toBe(
      "github.com/rocketbus/search",
    );
  });

  it("matches DD slug to https remote URL after normalization", () => {
    const dd = normalizeRepoSlug("github.com/rocketbus/search");
    const remote = normalizeRepoSlug("https://github.com/RocketBus/search.git");
    expect(dd).toEqual(remote);
  });

  it("strips trailing slashes and www", () => {
    expect(normalizeRepoSlug("https://www.github.com/Org/Repo/")).toBe(
      "github.com/org/repo",
    );
  });
});

describe("oldestStartedAt", () => {
  it("returns the minimum timestamp in ISO 8601 (seconds precision, Z)", () => {
    const batch = [
      { attributes: { started_at: "2026-03-05T10:00:00Z" } },
      { attributes: { started_at: "2026-03-05T09:00:00Z" } },
      { attributes: { started_at: "2026-03-05T11:00:00Z" } },
    ];
    expect(oldestStartedAt(batch, (e) => e.attributes.started_at)).toBe(
      "2026-03-05T09:00:00Z",
    );
  });

  it("returns null for empty batch", () => {
    expect(oldestStartedAt([], () => "")).toBeNull();
  });
});

describe("normalizeNullableIso", () => {
  it("returns null for the Datadog zero-value timestamp", () => {
    expect(normalizeNullableIso("0001-01-01T00:00:00Z")).toBeNull();
  });

  it("returns null for missing input", () => {
    expect(normalizeNullableIso(undefined)).toBeNull();
  });

  it("passes through real ISO timestamps", () => {
    expect(normalizeNullableIso("2026-03-05T12:34:56Z")).toBe(
      "2026-03-05T12:34:56.000Z",
    );
  });

  it("returns null for invalid input", () => {
    expect(normalizeNullableIso("not-a-date")).toBeNull();
  });
});

describe("uniqueByKey", () => {
  it("keeps the first occurrence of each key, preserving order", () => {
    const items = [
      { id: "a", v: 1 },
      { id: "b", v: 2 },
      { id: "a", v: 3 }, // duplicate of "a" — dropped
      { id: "c", v: 4 },
      { id: "b", v: 5 }, // duplicate of "b" — dropped
    ];
    expect(uniqueByKey(items, (x) => x.id)).toEqual([
      { id: "a", v: 1 },
      { id: "b", v: 2 },
      { id: "c", v: 4 },
    ]);
  });

  it("handles composite keys (matches the deployment_commits PK)", () => {
    const rows = [
      { deployment_id: "d1", commit_sha: "abc" },
      { deployment_id: "d1", commit_sha: "abc" }, // intra-deploy dupe
      { deployment_id: "d2", commit_sha: "abc" }, // different deploy, kept
    ];
    expect(
      uniqueByKey(rows, (r) => `${r.deployment_id}:${r.commit_sha}`),
    ).toEqual([
      { deployment_id: "d1", commit_sha: "abc" },
      { deployment_id: "d2", commit_sha: "abc" },
    ]);
  });

  it("returns an empty array on empty input", () => {
    expect(uniqueByKey([], (x) => String(x))).toEqual([]);
  });
});
