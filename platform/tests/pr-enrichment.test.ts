import { describe, expect, it } from "vitest";

import {
  formatPrSteps,
  formatRepoNames,
  prDegradedSteps,
} from "@/lib/pr-enrichment";
import { translations } from "@/lib/translations";

describe("prDegradedSteps", () => {
  it("returns no steps when the payload has no such field", () => {
    expect(prDegradedSteps(undefined)).toEqual([]);
  });

  it("returns the steps the engine reported", () => {
    expect(prDegradedSteps(["enrichment", "reviews"])).toEqual([
      "enrichment",
      "reviews",
    ]);
  });

  it("ignores values it does not recognise", () => {
    expect(prDegradedSteps(["enrichment", "bogus", 7, null])).toEqual([
      "enrichment",
    ]);
  });

  it("ignores a field that is not a list", () => {
    expect(prDegradedSteps("enrichment")).toEqual([]);
    expect(prDegradedSteps({ enrichment: true })).toEqual([]);
  });
});

describe("PR data badge strings", () => {
  it.each(["en-US", "pt-BR"] as const)("are defined in %s", (locale) => {
    const prData = translations[locale].repos.detail.prData;

    expect(prData.incomplete).toBeTruthy();
    expect(prData.incompleteTooltip).toContain("{steps}");
  });

  // Enrichment failing for open or closed PRs leaves the merge strategy
  // classified; only merged PRs feed it.
  it("ties the unclassified merge strategy to merged PRs", () => {
    expect(
      translations["en-US"].repos.detail.prData.incompleteTooltip,
    ).toContain("when enrichment fails for merged PRs");
    expect(
      translations["pt-BR"].repos.detail.prData.incompleteTooltip,
    ).toContain("quando o enriquecimento dos PRs mergeados falha");
  });

  // A failed open list, or a failed pass for open PRs, omits open-PR fields
  // too: the tooltip names them, as the engine's report caveat does.
  it("names open-PR metrics among what may be missing", () => {
    expect(
      translations["en-US"].repos.detail.prData.incompleteTooltip,
    ).toContain("flow, review, in-PR and open-PR metrics may be missing");
    expect(
      translations["pt-BR"].repos.detail.prData.incompleteTooltip,
    ).toContain("de commits em PR e de PRs abertos podem faltar");
  });

  // A failed merged list omits the PR lifecycle fields, as the engine's
  // report caveat says.
  it("names PR lifecycle metrics among what may be missing", () => {
    expect(
      translations["en-US"].repos.detail.prData.incompleteTooltip,
    ).toContain(
      "PR lifecycle (counts, time to merge, cycle time), flow, review, in-PR and open-PR metrics",
    );
    expect(
      translations["pt-BR"].repos.detail.prData.incompleteTooltip,
    ).toContain(
      "métricas de ciclo de vida de PR (contagens, tempo até o merge, cycle time), de flow",
    );
  });
});

describe("prDegradedSteps duplicates", () => {
  it("drops repeated steps, keeping the first occurrence's order", () => {
    expect(
      prDegradedSteps(["reviews", "basic", "reviews", "basic", "fetch"]),
    ).toEqual(["reviews", "basic", "fetch"]);
  });
});

// A `t()` over the real catalogue, as the app resolves it (no es-ES needed).
function translator(locale: "en-US" | "pt-BR") {
  return (path: string, params?: Record<string, string | number>) => {
    let value: unknown = translations[locale];
    for (const key of path.split(".")) {
      value = (value as Record<string, unknown>)?.[key];
    }
    let text = String(value);
    for (const [k, v] of Object.entries(params ?? {})) {
      text = text.replace(`{${k}}`, String(v));
    }
    return text;
  };
}

describe("formatPrSteps", () => {
  it("lists localized step labels, comma separated", () => {
    const steps = ["basic", "enrichment", "reviews", "fetch"] as const;
    expect(formatPrSteps(steps, translator("en-US"))).toBe(
      "PR list, commit enrichment, reviews, PR read",
    );
    expect(formatPrSteps(["basic", "fetch"], translator("pt-BR"))).toBe(
      "listagem de PRs, leitura de PRs",
    );
  });

  it("is empty for no steps", () => {
    expect(formatPrSteps([], translator("en-US"))).toBe("");
  });
});

describe("formatRepoNames", () => {
  const names = ["a", "b", "c", "d", "e", "f", "g"];

  it("lists every name up to the cap", () => {
    expect(formatRepoNames(names.slice(0, 5), translator("en-US"))).toBe(
      "a, b, c, d, e",
    );
  });

  it("collapses the rest into a localized count", () => {
    expect(formatRepoNames(names, translator("en-US"))).toBe(
      "a, b, c, d, e and 2 more",
    );
    expect(formatRepoNames(names, translator("pt-BR"))).toBe(
      "a, b, c, d, e e mais 2",
    );
  });
});
