import { describe, expect, it } from "vitest";

import { prDegradedSteps } from "@/lib/pr-enrichment";
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
});
