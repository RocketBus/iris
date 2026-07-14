import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("@/lib/tokens", () => ({
  validateToken: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock("@/lib/telemetry", () => ({
  withSpan: (
    _name: string,
    _attrs: unknown,
    fn: (span: { setAttributes: (a: unknown) => void }) => unknown,
  ) => fn({ setAttributes: vi.fn() }),
  recordError: vi.fn(),
}));

import { POST } from "@/app/api/ingest/usage/route";
import { supabaseAdmin } from "@/lib/supabase";
import { validateToken } from "@/lib/tokens";

const mockedValidate = vi.mocked(validateToken);

const mockedFrom = supabaseAdmin.from as unknown as ReturnType<typeof vi.fn>;

const mockedRpc = supabaseAdmin.rpc as unknown as ReturnType<typeof vi.fn>;

const VALID_RECORD = {
  schema: "iris.agent_usage.v1",
  agent: "claude_code",
  repo: "RocketBus/iris",
  period: "2026-06-11",
  model: "claude-opus-4-8",
  input_tokens: 300,
  output_tokens: 30,
  cache_read_input_tokens: 50,
  cache_creation_input_tokens: 20,
  tool_calls: 2,
  sidechain_tool_calls: 0,
  sessions: 1,
  duration_bucket: "15-60m",
  idempotency_key: "abc123",
};

// A repositories query chain that resolves to an existing repo. Exposes `eq`
// so tests can assert the repo name used for resolution.
function existingRepoChain(id = "repo-1") {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve({ data: { id }, error: null }));
  chain.insert = vi.fn(() => chain);
  return chain;
}

// A repositories query chain for a repo the org has never onboarded. `.single()`
// resolves with no row (PostgREST's shape for "0 rows"). Exposes `insert` so
// tests can assert usage ingestion never creates repositories.
function missingRepoChain() {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn(() =>
    Promise.resolve({ data: null, error: { code: "PGRST116" } }),
  );
  chain.insert = vi.fn(() => chain);
  return chain;
}

function makeRequest(
  body: unknown,
  authorization = "Bearer iris_test",
): Request {
  return new Request("http://localhost/api/ingest/usage", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  mockedValidate.mockReset();
  mockedFrom.mockReset();
  mockedRpc.mockReset();
  mockedValidate.mockResolvedValue({
    organization_id: "org-1",
    token_id: "tok-1",
  });
  mockedFrom.mockReturnValue(existingRepoChain());
  mockedRpc.mockResolvedValue({ data: true, error: null });
});

describe("POST /api/ingest/usage", () => {
  it("401 without a bearer token", async () => {
    const res = await POST(makeRequest({ records: [VALID_RECORD] }, ""));
    expect(res.status).toBe(401);
  });

  it("401 for an invalid token", async () => {
    mockedValidate.mockResolvedValue(null);
    const res = await POST(makeRequest({ records: [VALID_RECORD] }));
    expect(res.status).toBe(401);
  });

  it("400 for invalid JSON", async () => {
    const res = await POST(makeRequest("{not json"));
    expect(res.status).toBe(400);
  });

  it("400 when an identity field is present (defense in depth)", async () => {
    const res = await POST(
      makeRequest({ records: [{ ...VALID_RECORD, email: "dev@example.com" }] }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.field).toBe("email");
    expect(mockedRpc).not.toHaveBeenCalled();
  });

  it("400 when an unknown field is present (strict schema)", async () => {
    const res = await POST(
      makeRequest({ records: [{ ...VALID_RECORD, surprise: 1 }] }),
    );
    expect(res.status).toBe(400);
  });

  it("400 when a required field is missing", async () => {
    const { input_tokens, ...incomplete } = VALID_RECORD;
    void input_tokens;
    const res = await POST(makeRequest({ records: [incomplete] }));
    expect(res.status).toBe(400);
  });

  it("200 applies a valid record and maps fields to the rollup RPC", async () => {
    const res = await POST(makeRequest({ records: [VALID_RECORD] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      applied: 1,
      duplicates: 0,
      skipped: 0,
      repositories: 1,
    });

    expect(mockedRpc).toHaveBeenCalledWith(
      "ingest_usage_rollup",
      expect.objectContaining({
        p_org: "org-1",
        p_repo: "repo-1",
        p_period: "2026-06-11",
        p_model: "claude-opus-4-8",
        p_dedup_key: "abc123",
        p_input_tokens: 300,
        p_cache_read_tokens: 50, // cache_read_input_tokens → p_cache_read_tokens
        p_cache_creation_tokens: 20,
        p_tool_calls: 2,
        p_duration_bucket: "15-60m",
      }),
    );
  });

  it("normalizes owner/repo to the bare repo name for resolution", async () => {
    const chain = existingRepoChain();
    mockedFrom.mockReturnValue(chain);
    await POST(makeRequest({ records: [VALID_RECORD] }));
    // RocketBus/iris → iris, so it lands on the same repo row as durability metrics.
    expect(chain.eq).toHaveBeenCalledWith("name", "iris");
  });

  it("counts duplicates separately when the RPC reports a replay", async () => {
    mockedRpc.mockResolvedValue({ data: false, error: null });
    const res = await POST(makeRequest({ records: [VALID_RECORD] }));
    const json = await res.json();
    expect(json).toEqual({
      applied: 0,
      duplicates: 1,
      skipped: 0,
      repositories: 1,
    });
  });

  it("skips usage for a repo the org has not onboarded — never creates it", async () => {
    const chain = missingRepoChain();
    mockedFrom.mockReturnValue(chain);

    const res = await POST(makeRequest({ records: [VALID_RECORD] }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      applied: 0,
      duplicates: 0,
      skipped: 1,
      repositories: 0,
    });
    // The whole point: usage never materializes a repository row, and unknown
    // repos never reach the rollup.
    expect(chain.insert).not.toHaveBeenCalled();
    expect(mockedRpc).not.toHaveBeenCalled();
  });

  it("500 when the RPC errors", async () => {
    mockedRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await POST(makeRequest({ records: [VALID_RECORD] }));
    expect(res.status).toBe(500);
  });

  it("processes a multi-record batch and reuses the repo lookup", async () => {
    const chain = existingRepoChain();
    mockedFrom.mockReturnValue(chain);
    const res = await POST(
      makeRequest({
        records: [
          VALID_RECORD,
          {
            ...VALID_RECORD,
            model: "claude-haiku-4-5",
            idempotency_key: "abc123",
          },
        ],
      }),
    );
    const json = await res.json();
    expect(json.applied).toBe(2);
    expect(json.repositories).toBe(1);
    expect(mockedFrom).toHaveBeenCalledTimes(1); // same repo cached across records
    expect(mockedRpc).toHaveBeenCalledTimes(2);
  });
});
