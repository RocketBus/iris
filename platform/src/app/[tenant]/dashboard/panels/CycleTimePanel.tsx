import {
  loadPayloads,
  loadPreviousPeriod,
  loadRepoSummaries,
  type DashboardPanelProps,
} from "../data";
import { CycleTime } from "../sections/CycleTime";

import { computeCycleTime } from "@/lib/queries/org-summary";

export async function CycleTimePanel({
  orgId,
  windowDays,
}: DashboardPanelProps) {
  const [repos, payloads, previous] = await Promise.all([
    loadRepoSummaries(orgId, windowDays),
    loadPayloads(orgId, windowDays),
    loadPreviousPeriod(orgId, windowDays),
  ]);

  const data = computeCycleTime(repos, payloads, previous.payloads);
  if (!data) return null;
  return <CycleTime data={data} />;
}
