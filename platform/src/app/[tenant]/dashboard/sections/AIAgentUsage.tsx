"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { AgentUsageRow, AgentUsageSection } from "@/types/usage";

interface AIAgentUsageProps {
  data: AgentUsageSection;
}

function fmtCompact(n: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function fmtInt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function fmtPct(value: number | null, decimals = 0): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
}

function dominantBucket(buckets: Record<string, number>): string {
  let best: string | null = null;
  let bestCount = -1;
  for (const [bucket, count] of Object.entries(buckets)) {
    if (count > bestCount) {
      best = bucket;
      bestCount = count;
    }
  }
  return best ?? "—";
}

function Row({ row }: { row: AgentUsageRow }) {
  const { t } = useTranslation();
  return (
    <tr
      className={cn(
        "border-b border-border last:border-0 hover:bg-muted/30",
        row.suppressed && "text-muted-foreground",
      )}
    >
      <td className="px-4 py-3 font-medium">
        {row.suppressed ? (
          <>
            {t("agentUsage.othersRow")}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({t("agentUsage.othersDetail", { count: row.repoCount })})
            </span>
          </>
        ) : (
          row.repo
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {row.suppressed ? "—" : fmtInt(row.contributors)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {fmtInt(row.sessions)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {fmtCompact(row.inputTokens)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {fmtCompact(row.outputTokens)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {fmtInt(row.toolCalls)}
      </td>
      <td className="px-4 py-3 text-xs">{row.topModel ?? "—"}</td>
      <td className="px-4 py-3 text-xs">
        {dominantBucket(row.durationBuckets)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {fmtPct(row.stabilization)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {fmtPct(row.durabilityAi)}
      </td>
    </tr>
  );
}

export function AIAgentUsage({ data }: AIAgentUsageProps) {
  const { t } = useTranslation();
  const allRows = data.suppressedRow
    ? [...data.rows, data.suppressedRow]
    : data.rows;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("agentUsage.title")}</CardTitle>
        <CardDescription>{t("agentUsage.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">
                  {t("agentUsage.columnRepo")}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("agentUsage.columnContributors")}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("agentUsage.columnSessions")}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("agentUsage.columnInput")}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("agentUsage.columnOutput")}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("agentUsage.columnTools")}
                </th>
                <th className="px-4 py-2 font-medium">
                  {t("agentUsage.columnModel")}
                </th>
                <th className="px-4 py-2 font-medium">
                  {t("agentUsage.columnSession")}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("agentUsage.columnStabilization")}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("agentUsage.columnDurability")}
                </th>
              </tr>
            </thead>
            <tbody>
              {allRows.map((row, i) => (
                <Row key={row.repo ?? `suppressed-${i}`} row={row} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {t("agentUsage.kAnonymityNote", { k: data.kThreshold })}
        </p>
      </CardContent>
    </Card>
  );
}
