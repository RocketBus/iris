/**
 * Formats an ISO date-only string (e.g. "2026-08-23", as emitted by the
 * engine's `activity_timeline.week_start`) for chart axes/tooltips, in the
 * viewer's own locale instead of a hardcoded month/day order.
 *
 * Forces `timeZone: "UTC"`: a date-only ISO string parses as UTC midnight,
 * so reading it back through the browser's local timezone (the default for
 * both `Date` getters and `toLocaleDateString`) shifts the displayed date
 * back a day for anyone west of UTC — Brazil (the default locale) included.
 */
export function formatChartDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}
