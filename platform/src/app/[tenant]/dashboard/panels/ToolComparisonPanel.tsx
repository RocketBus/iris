import { loadPayloads, type DashboardPanelProps } from "../data";
import { ToolComparison } from "../sections/ToolComparison";

import { computeToolComparison } from "@/lib/queries/tool-comparison";

export async function ToolComparisonPanel({
  orgId,
  windowDays,
}: DashboardPanelProps) {
  const payloads = await loadPayloads(orgId, windowDays);
  const data = computeToolComparison(payloads);
  if (!data) return null;
  return <ToolComparison data={data} />;
}
