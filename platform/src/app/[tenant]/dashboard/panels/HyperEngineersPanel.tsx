import {
  loadContributors,
  loadPayloads,
  type DashboardPanelProps,
} from "../data";
import { HyperEngineers } from "../sections/HyperEngineers";

import { computeHyperEngineers } from "@/lib/queries/org-summary";

export async function HyperEngineersPanel({
  orgId,
  windowDays,
}: DashboardPanelProps) {
  const [payloads, contributors] = await Promise.all([
    loadPayloads(orgId, windowDays),
    loadContributors(orgId, windowDays),
  ]);

  return (
    <HyperEngineers
      engineers={computeHyperEngineers(payloads, contributors.userMap)}
    />
  );
}
