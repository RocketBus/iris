import {
  loadPayloads,
  loadPreviousPeriod,
  loadRepoSummaries,
  type DashboardPanelProps,
} from "../data";
import { PRHealth } from "../sections/PRHealth";

import { computePRHealth } from "@/lib/queries/org-summary";

export async function PRHealthPanel({
  orgId,
  windowDays,
}: DashboardPanelProps) {
  const [repos, payloads, previous] = await Promise.all([
    loadRepoSummaries(orgId, windowDays),
    loadPayloads(orgId, windowDays),
    loadPreviousPeriod(orgId, windowDays),
  ]);

  const data = computePRHealth(repos, payloads, previous.payloads);
  if (!data) return null;
  return <PRHealth data={data} />;
}
