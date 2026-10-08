import {
  loadPayloads,
  loadRepoSummaries,
  type DashboardPanelProps,
} from "../data";

import {
  degradedReposFromPayloads,
  formatRepoNames,
} from "@/lib/pr-enrichment";
import { getServerTranslation } from "@/lib/server-translation";

/**
 * Amber note above the PR-driven panels when a repo's latest run read its PR
 * data only partially. Renders nothing when no repo degraded.
 */
export async function PRDataNotice({ orgId, windowDays }: DashboardPanelProps) {
  const [repos, payloads] = await Promise.all([
    loadRepoSummaries(orgId, windowDays),
    loadPayloads(orgId, windowDays),
  ]);

  const degraded = degradedReposFromPayloads(repos, payloads);
  if (degraded.length === 0) return null;

  const { t } = await getServerTranslation();
  return (
    <p
      role="note"
      className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
    >
      {t("dashboard.prDataIncomplete", {
        count: degraded.length,
        repos: formatRepoNames(
          degraded.map((r) => r.name),
          t,
        ),
      })}
    </p>
  );
}
