import { loadPayloads, type DashboardPanelProps } from "../data";
import { AIvsHuman } from "../sections/AIvsHuman";

import { computeAIvsHuman } from "@/lib/queries/org-summary";

export async function AIvsHumanPanel({
  orgId,
  windowDays,
  tenantSlug,
}: DashboardPanelProps) {
  const payloads = await loadPayloads(orgId, windowDays);
  const data = computeAIvsHuman(payloads);
  if (!data) return null;
  return <AIvsHuman data={data} tenantSlug={tenantSlug} />;
}
