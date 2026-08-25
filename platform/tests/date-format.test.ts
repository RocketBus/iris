import { describe, expect, it } from "vitest";

import { formatChartDate } from "@/lib/date-format";

describe("formatChartDate", () => {
  it("respects the requested locale's month/day order", () => {
    expect(formatChartDate("2026-08-23", "en-US")).toBe("Aug 23");
    expect(formatChartDate("2026-08-23", "pt-BR")).toBe("23 de ago.");
  });

  it("does not shift the date for viewers west of UTC", () => {
    // A date-only ISO string parses as UTC midnight; without forcing
    // timeZone: "UTC", en-US in a UTC-3 environment would read this back as
    // "Aug 22" instead of "Aug 23".
    const originalTZ = process.env.TZ;
    process.env.TZ = "America/Sao_Paulo";
    try {
      expect(formatChartDate("2026-08-23", "en-US")).toBe("Aug 23");
    } finally {
      process.env.TZ = originalTZ;
    }
  });
});
