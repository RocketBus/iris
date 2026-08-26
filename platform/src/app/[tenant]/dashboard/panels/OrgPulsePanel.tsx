import {
  loadContributors,
  loadPayloads,
  loadPreviousPeriod,
  loadRepoSummaries,
  type DashboardPanelProps,
} from "../data";
import { OrgPulse } from "../sections/OrgPulse";

import { computeOrgPulse } from "@/lib/queries/org-summary";

export async function OrgPulsePanel({
  orgId,
  windowDays,
}: DashboardPanelProps) {
  const [repos, payloads, contributors, previous] = await Promise.all([
    loadRepoSummaries(orgId, windowDays),
    loadPayloads(orgId, windowDays),
    loadContributors(orgId, windowDays),
    loadPreviousPeriod(orgId, windowDays),
  ]);

  if (!repos.some((r) => r.stabilization_ratio !== null)) return null;

  return (
    <OrgPulse
      data={computeOrgPulse(
        repos,
        payloads,
        contributors.count,
        previous.totals,
      )}
    />
  );
}
