import { loadRepoSummaries, type DashboardPanelProps } from "../data";
import { HealthMap } from "../sections/HealthMap";

import { computeHealthMap } from "@/lib/queries/org-summary";

export async function HealthMapPanel({
  orgId,
  windowDays,
  tenantSlug,
}: DashboardPanelProps) {
  const repos = await loadRepoSummaries(orgId, windowDays);
  return <HealthMap entries={computeHealthMap(repos)} orgSlug={tenantSlug} />;
}
