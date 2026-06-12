import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The module caches in module scope, so each test imports a fresh copy.
async function freshModule() {
  vi.resetModules();
  return import("@/lib/cli-version");
}

function okRelease(tag: string) {
  return { ok: true, json: async () => ({ tag_name: tag }) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isUpdateAvailable", () => {
  it("is true only when latest is strictly newer", async () => {
    const { isUpdateAvailable } = await freshModule();
    expect(isUpdateAvailable("v1.4.5", "v1.4.4")).toBe(true);
    expect(isUpdateAvailable("v2.0.0", "v1.9.9")).toBe(true);
    expect(isUpdateAvailable("1.5.0", "v1.4.9")).toBe(true);
    expect(isUpdateAvailable("v1.4.4", "v1.4.4")).toBe(false);
    expect(isUpdateAvailable("v1.4.3", "v1.4.4")).toBe(false);
  });

  it("is false when either version is missing", async () => {
    const { isUpdateAvailable } = await freshModule();
    expect(isUpdateAvailable(null, "v1.4.4")).toBe(false);
    expect(isUpdateAvailable("v1.4.5", null)).toBe(false);
  });
});

describe("getLatestCliVersion", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns the tag_name from the releases API", async () => {
    const fetchMock = vi.fn(async () => okRelease("v1.4.5"));
    vi.stubGlobal("fetch", fetchMock);
    const { getLatestCliVersion } = await freshModule();
    expect(await getLatestCliVersion(0)).toBe("v1.4.5");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("caches within the TTL and refetches after it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okRelease("v1.4.5"))
      .mockResolvedValueOnce(okRelease("v1.5.0"));
    vi.stubGlobal("fetch", fetchMock);
    const { getLatestCliVersion } = await freshModule();

    expect(await getLatestCliVersion(0)).toBe("v1.4.5");
    // Same hour window: served from cache, no second fetch.
    expect(await getLatestCliVersion(60_000)).toBe("v1.4.5");
    expect(fetchMock).toHaveBeenCalledOnce();

    // Past the 1h TTL: refetch.
    expect(await getLatestCliVersion(2 * 60 * 60 * 1000)).toBe("v1.5.0");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null on a non-ok response without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );
    const { getLatestCliVersion } = await freshModule();
    expect(await getLatestCliVersion(0)).toBeNull();
  });

  it("returns null when fetch throws (network/timeout)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("timeout");
      }),
    );
    const { getLatestCliVersion } = await freshModule();
    expect(await getLatestCliVersion(0)).toBeNull();
  });
});
