import { loadChanges, type DashboardPanelProps } from "../data";

import { ChangeAlert } from "@/components/charts/ChangeAlert";

export async function ChangeAlertPanel({
  orgId,
  windowDays,
  tenantSlug,
}: DashboardPanelProps) {
  const changes = await loadChanges(orgId, windowDays);
  return <ChangeAlert changes={changes} tenantSlug={tenantSlug} />;
}
