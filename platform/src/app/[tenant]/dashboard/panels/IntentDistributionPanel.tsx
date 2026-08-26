import { loadPayloads, type DashboardPanelProps } from "../data";
import { IntentDistribution } from "../sections/IntentDistribution";

import { computeIntentDistribution } from "@/lib/queries/org-summary";

export async function IntentDistributionPanel({
  orgId,
  windowDays,
}: DashboardPanelProps) {
  const payloads = await loadPayloads(orgId, windowDays);
  const data = computeIntentDistribution(payloads);
  if (!data) return null;
  return <IntentDistribution data={data} />;
}
