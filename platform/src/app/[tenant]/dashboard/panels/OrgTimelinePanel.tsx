import { loadPayloads, type DashboardPanelProps } from "../data";
import { OrgTimeline } from "../sections/OrgTimeline";

import { computeOrgTimeline } from "@/lib/queries/org-summary";

export async function OrgTimelinePanel({
  orgId,
  windowDays,
}: DashboardPanelProps) {
  const payloads = await loadPayloads(orgId, windowDays);
  return <OrgTimeline data={computeOrgTimeline(payloads)} />;
}
