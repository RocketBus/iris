import { loadDORA, type DashboardPanelProps } from "../data";
import { DORAOverview } from "../sections/DORAOverview";

export async function DORAPanel({ orgId, windowDays }: DashboardPanelProps) {
  const data = await loadDORA(orgId, windowDays);
  if (!data) return null;
  return <DORAOverview data={data} />;
}
