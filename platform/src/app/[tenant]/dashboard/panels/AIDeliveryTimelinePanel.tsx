import {
  loadPayloads,
  loadRepoSummaries,
  type DashboardPanelProps,
} from "../data";
import { AIDeliveryTimeline } from "../sections/AIDeliveryTimeline";

import { computeOrgAdoption } from "@/lib/queries/adoption-timeline";

export async function AIDeliveryTimelinePanel({
  orgId,
  windowDays,
  tenantSlug,
}: DashboardPanelProps) {
  const [repos, payloads] = await Promise.all([
    loadRepoSummaries(orgId, windowDays),
    loadPayloads(orgId, windowDays),
  ]);

  const repoNameIndex = new Map(repos.map((r) => [r.id, r.name]));
  return (
    <AIDeliveryTimeline
      rows={computeOrgAdoption(payloads, repoNameIndex)}
      orgSlug={tenantSlug}
    />
  );
}
