import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { getOrgReposSummary } from "@/lib/queries/temporal";

type Result = { data: unknown[] | null; error: { message: string } | null };

// Minimal chainable stand-in for the supabase query builder: every filter
// returns the builder, awaiting it yields the canned result.
function builder(result: Result) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "in"]) b[m] = () => b;
  b.then = (resolve: (r: Result) => unknown) => resolve(result);
  return b;
}

function fakeClient(
  summaries: (columns: string) => Result,
  selects: string[] = [],
) {
  return {
    from: (table: string) => {
      if (table === "repositories") {
        return builder({
          data: [{ id: "r1", name: "alpha", remote_url: null }],
          error: null,
        });
      }
      const b = builder({ data: [], error: null });
      b.select = (columns: string) => {
        selects.push(columns);
        return builder(summaries(columns));
      };
      return b;
    },
  } as unknown as SupabaseClient;
}

const row = (extra: Record<string, unknown> = {}) => ({
  repository_id: "r1",
  runs_count: 1,
  last_run_at: "2026-08-01T00:00:00Z",
  recent_stabilization: [],
  ...extra,
});

describe("getOrgReposSummary — PR data degradation", () => {
  it("maps pr_enrichment_degraded to the known steps", async () => {
    const client = fakeClient(() => ({
      data: [row({ pr_enrichment_degraded: ["reviews", "bogus"] })],
      error: null,
    }));

    const [repo] = await getOrgReposSummary(client, "org", 30);
    expect(repo.pr_degraded_steps).toEqual(["reviews"]);
  });

  it("leaves absent or garbage values unmarked", async () => {
    for (const extra of [{}, { pr_enrichment_degraded: "reviews" }]) {
      const client = fakeClient(() => ({ data: [row(extra)], error: null }));
      const [repo] = await getOrgReposSummary(client, "org", 30);
      expect(repo.pr_degraded_steps).toEqual([]);
    }
  });

  it("keeps the table populated, unmarked, when the view lacks payload", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const selects: string[] = [];
    const client = fakeClient(
      (columns) =>
        columns.includes("payload")
          ? {
              data: null,
              error: { message: 'column "payload" does not exist' },
            }
          : { data: [row()], error: null },
      selects,
    );

    const repos = await getOrgReposSummary(client, "org", 30);
    error.mockRestore();

    expect(repos).toHaveLength(1);
    expect(repos[0].runs_count).toBe(1);
    expect(repos[0].pr_degraded_steps).toEqual([]);
    expect(selects).toHaveLength(2);
  });
});
