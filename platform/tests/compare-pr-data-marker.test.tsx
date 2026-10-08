import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { translations } from "@/lib/translations";
import type { RepoSummary } from "@/types/temporal";

// The real hook reads the session; the view only needs `t()` over en-US.
vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (path: string, params?: Record<string, string | number>) => {
      let value: unknown = translations["en-US"];
      for (const key of path.split(".")) {
        value = (value as Record<string, unknown>)?.[key];
      }
      let text = String(value);
      for (const [k, v] of Object.entries(params ?? {})) {
        text = text.replace(`{${k}}`, String(v));
      }
      return text;
    },
  }),
}));

function repo(
  id: string,
  name: string,
  steps: RepoSummary["pr_degraded_steps"],
): RepoSummary {
  return {
    id,
    name,
    remote_url: null,
    last_run_at: null,
    runs_count: 1,
    stabilization_ratio: 0.9,
    revert_rate: 0,
    churn_events: 1,
    commits_total: 10,
    ai_detection_coverage_pct: null,
    pr_merged_count: 1,
    pr_single_pass_rate: null,
    fix_latency_median_hours: null,
    cascade_rate: null,
    merge_strategy: null,
    commit_metrics_reliable: null,
    pr_degraded_steps: steps,
    stabilization_delta: null,
    health: "healthy",
    sparkline: [],
  };
}

async function render(): Promise<string> {
  const { CompareView } = await import("@/app/[tenant]/compare/compare-view");
  return renderToStaticMarkup(
    <CompareView
      repos={[
        repo("1", "widgets", ["basic", "reviews"]),
        repo("2", "gadgets", []),
      ]}
    />,
  );
}

const count = (text: string, part: string) => text.split(part).length - 1;

describe("CompareView PR-data marker", () => {
  // Touch and keyboard users get no hover title, and sighted keyboard users
  // on the desktop table neither: both layouts show the steps as text.
  it("shows the failed steps as text in the table and on the card", async () => {
    const html = await render();

    expect(count(html, "<span>PR list, reviews</span>")).toBe(2);
  });

  // Each layout reads the full sentence once: the visible steps (and the
  // dot) are aria-hidden, and only the sr-only sentence is announced. The
  // table and the card are never shown at once, so a reader meets one.
  it("announces the full sentence once per layout", async () => {
    const html = await render();

    expect(count(html, '<span aria-hidden="true" title="This run')).toBe(2);
    expect(count(html, '<span class="sr-only">This run')).toBe(2);
    expect(html).not.toContain("PR data incomplete: ");
  });

  // On the card the name truncates: the steps get a line of their own so a
  // long list cannot squeeze it.
  it("keeps the steps off the card's name row", async () => {
    const html = await render();
    const rowStart = html.indexOf('items-baseline gap-2">');
    const nameRow = html.slice(rowStart, html.indexOf("</div>", rowStart));

    expect(nameRow).toContain("widgets");
    expect(nameRow).not.toContain("PR list");
  });

  // Amber 500 is ~2.1:1 on the light card, below WCAG 1.4.11's 3:1.
  it("uses an amber dot that keeps 3:1 on light and dark", async () => {
    const html = await render();

    expect(html).toContain("bg-amber-600 dark:bg-amber-500");
    expect(html).not.toMatch(/(?<!dark:)bg-amber-500/);
  });
});
