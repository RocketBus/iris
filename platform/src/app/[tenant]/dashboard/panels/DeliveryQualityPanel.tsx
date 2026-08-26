import {
  loadPayloads,
  loadPreviousPeriod,
  loadRepoSummaries,
  type DashboardPanelProps,
} from "../data";
import { DeliveryQuality } from "../sections/DeliveryQuality";

import { computeDeliveryQuality } from "@/lib/queries/org-summary";

export async function DeliveryQualityPanel({
  orgId,
  windowDays,
}: DashboardPanelProps) {
  const [repos, payloads, previous] = await Promise.all([
    loadRepoSummaries(orgId, windowDays),
    loadPayloads(orgId, windowDays),
    loadPreviousPeriod(orgId, windowDays),
  ]);

  return (
    <DeliveryQuality
      data={computeDeliveryQuality(repos, payloads, previous.payloads)}
    />
  );
}
