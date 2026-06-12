/**
 * Resolve the latest published Iris CLI version from GitHub Releases.
 *
 * The CLI sends its own version on every ingest; we hand back the latest tag so
 * an opted-in CLI can self-update silently. install.sh resolves "latest" the
 * same way (RocketBus/iris releases) — this is the server-side mirror of that
 * lookup, cached so a burst of pushes can't hammer the GitHub API.
 */

const RELEASES_LATEST_URL =
  "https://api.github.com/repos/RocketBus/iris/releases/latest";

// GitHub's unauthenticated rate limit is 60 req/h per IP; one fetch per hour is
// plenty since releases are cut rarely. Cached in module scope — Fluid Compute
// reuses function instances, so this survives across many invocations.
const CACHE_TTL_MS = 60 * 60 * 1000;

let cached: { value: string | null; at: number } | null = null;

function isFresh(entry: { at: number } | null, now: number): boolean {
  return entry !== null && now - entry.at < CACHE_TTL_MS;
}

/**
 * Latest CLI tag (e.g. "v1.4.4"), or null if it can't be resolved. Never
 * throws — a failed lookup must not break ingestion, just omits the hint.
 */
export async function getLatestCliVersion(
  now = Date.now(),
): Promise<string | null> {
  if (isFresh(cached, now)) {
    return cached!.value;
  }

  try {
    const res = await fetch(RELEASES_LATEST_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "iris-platform",
      },
      // Short timeout: the ingest response shouldn't wait on GitHub.
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      // Cache the miss briefly so we don't retry on every push.
      cached = { value: cached?.value ?? null, at: now };
      return cached.value;
    }
    const data = (await res.json()) as { tag_name?: unknown };
    const tag = typeof data.tag_name === "string" ? data.tag_name : null;
    cached = { value: tag, at: now };
    return tag;
  } catch {
    cached = { value: cached?.value ?? null, at: now };
    return cached.value;
  }
}

/** Parse "v1.4.4" / "1.4.4" into a comparable [major, minor, patch] tuple. */
function parseVersion(v: string): [number, number, number] {
  const parts = v
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .slice(0, 3)
    .map((chunk) => {
      const m = chunk.match(/^\d+/);
      return m ? parseInt(m[0], 10) : 0;
    });
  while (parts.length < 3) parts.push(0);
  return [parts[0], parts[1], parts[2]];
}

/** True iff `latest` is strictly newer than `current`. */
export function isUpdateAvailable(
  latest: string | null,
  current: string | null,
): boolean {
  if (!latest || !current) return false;
  const [aM, aMi, aP] = parseVersion(latest);
  const [bM, bMi, bP] = parseVersion(current);
  if (aM !== bM) return aM > bM;
  if (aMi !== bMi) return aMi > bMi;
  return aP > bP;
}
