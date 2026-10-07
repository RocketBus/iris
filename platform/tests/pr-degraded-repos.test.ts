import { describe, expect, it } from "vitest";

import { degradedReposFromPayloads } from "@/lib/pr-enrichment";
import { translations } from "@/lib/translations";

describe("degradedReposFromPayloads", () => {
  const repos = [
    { id: "a", name: "alpha" },
    { id: "b", name: "beta" },
    { id: "c", name: "gamma" },
  ];

  it("lists only the repos whose latest payload reports degraded steps", () => {
    const payloads = new Map<string, { pr_enrichment_degraded?: unknown }>([
      ["a", { pr_enrichment_degraded: ["reviews"] }],
      ["b", {}],
      ["c", { pr_enrichment_degraded: ["basic", "fetch"] }],
    ]);

    expect(degradedReposFromPayloads(repos, payloads)).toEqual([
      { id: "a", name: "alpha", steps: ["reviews"] },
      { id: "c", name: "gamma", steps: ["basic", "fetch"] },
    ]);
  });

  it("ignores garbage, empty lists and repos without a payload", () => {
    const payloads = new Map<string, { pr_enrichment_degraded?: unknown }>([
      ["a", { pr_enrichment_degraded: "reviews" }],
      ["b", { pr_enrichment_degraded: [] }],
    ]);

    expect(degradedReposFromPayloads(repos, payloads)).toEqual([]);
  });
});

describe("dashboard PR data note strings", () => {
  it.each(["en-US", "pt-BR"] as const)("are defined in %s", (locale) => {
    const text = translations[locale].dashboard.prDataIncomplete;

    expect(text).toContain("{count}");
    expect(text).toContain("{repos}");
  });
});
