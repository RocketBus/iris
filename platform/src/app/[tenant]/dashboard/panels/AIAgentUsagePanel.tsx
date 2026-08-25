import { loadAgentUsage, type DashboardPanelProps } from "../data";
import { AIAgentUsage } from "../sections/AIAgentUsage";

export async function AIAgentUsagePanel({
  orgId,
  windowDays,
}: DashboardPanelProps) {
  const data = await loadAgentUsage(orgId, windowDays);
  if (!data) return null;
  return <AIAgentUsage data={data} />;
}
