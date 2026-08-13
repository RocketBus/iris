import { describe, expect, it } from "vitest";

import { classifyHealth, healthFillColor } from "@/types/temporal";

describe("classifyHealth / healthFillColor", () => {
  it("classifies at the documented 0.6/0.4 cutoffs", () => {
    expect(classifyHealth(0.65)).toBe("healthy");
    expect(classifyHealth(0.6)).toBe("healthy");
    expect(classifyHealth(0.59)).toBe("warning");
    expect(classifyHealth(0.4)).toBe("warning");
    expect(classifyHealth(0.39)).toBe("critical");
    expect(classifyHealth(null)).toBe("unknown");
  });

  it("maps every health classification to a distinct color, so no two health map renderers can disagree on the same value", () => {
    const colors = (["healthy", "warning", "critical", "unknown"] as const).map(
      healthFillColor,
    );
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("gives the same color for the same classifyHealth output every time (regression guard for the HealthMap treemap-vs-mobile-list mismatch)", () => {
    // A repo at 0.65 must be "healthy" everywhere this dashboard renders it —
    // previously the treemap used a 0.7 cutoff while the mobile list used
    // classifyHealth's 0.6 cutoff, so the same value disagreed on color.
    const value = 0.65;
    expect(healthFillColor(classifyHealth(value))).toBe(
      "var(--color-signal-purple)",
    );
  });
});
