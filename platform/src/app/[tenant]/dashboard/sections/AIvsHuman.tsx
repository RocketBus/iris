"use client";

import Link from "next/link";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import type { AIvsHumanData } from "@/types/org-summary";

interface AIvsHumanProps {
  data: AIvsHumanData;
  tenantSlug?: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}`;
}

function ComparisonStat({
  label,
  human,
  ai,
  humanLabel,
  aiLabel,
}: {
  label: string;
  human: number | null;
  ai: number | null;
  humanLabel: string;
  aiLabel: string;
}) {
  if (human === null && ai === null) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex gap-6">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{humanLabel}</span>
          <span className="font-mono text-lg">
            {human !== null ? `${(human * 100).toFixed(0)}%` : "\u2014"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-primary">{aiLabel}</span>
          <span className="font-mono text-lg text-primary">
            {ai !== null ? `${(ai * 100).toFixed(0)}%` : "\u2014"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function AIvsHuman({ data, tenantSlug }: AIvsHumanProps) {
  const { t } = useTranslation();
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">
          {t("dashboard.aiVsHuman.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("dashboard.aiVsHuman.subtitle", { count: data.reposWithAI })}
        </p>
      </div>

      {/* Commit mix timeline */}
      {data.commitMix.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.aiVsHuman.commitMixTitle")}</CardTitle>
            <CardDescription>
              {t("dashboard.aiVsHuman.commitMixSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.commitMix}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={32}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                    fontSize: 12,
                    color: "var(--foreground)",
                  }}
                  labelStyle={{ color: "var(--foreground)" }}
                  itemStyle={{ color: "var(--muted-foreground)" }}
                  labelFormatter={(label) => formatDate(String(label))}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="human"
                  name={t("dashboard.aiVsHuman.human")}
                  stackId="1"
                  fill="var(--muted-foreground)"
                  fillOpacity={0.55}
                  stroke="var(--muted-foreground)"
                  strokeWidth={1.5}
                />
                <Area
                  type="monotone"
                  dataKey="ai"
                  name={t("dashboard.aiVsHuman.ai")}
                  stackId="1"
                  fill="var(--color-cat-1)"
                  fillOpacity={0.6}
                  stroke="var(--color-cat-1)"
                  strokeWidth={1.5}
                />
                <Area
                  type="monotone"
                  dataKey="bot"
                  name={t("dashboard.aiVsHuman.bot")}
                  stackId="1"
                  fill="var(--color-cat-2)"
                  fillOpacity={0.45}
                  stroke="var(--color-cat-2)"
                  strokeWidth={1}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Comparison stats + tool breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              {t("dashboard.aiVsHuman.qualityComparisonTitle")}
            </CardTitle>
            <CardDescription>
              {t("dashboard.aiVsHuman.qualityComparisonSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ComparisonStat
              label={t("dashboard.aiVsHuman.stabilization")}
              humanLabel={t("dashboard.aiVsHuman.human")}
              aiLabel={t("dashboard.aiVsHuman.ai")}
              human={data.stabilization.human}
              ai={data.stabilization.ai}
            />
            <ComparisonStat
              label={t("dashboard.aiVsHuman.codeDurability")}
              humanLabel={t("dashboard.aiVsHuman.human")}
              aiLabel={t("dashboard.aiVsHuman.ai")}
              human={data.durability.human}
              ai={data.durability.ai}
            />
            <ComparisonStat
              label={t("dashboard.aiVsHuman.cascadeRate")}
              humanLabel={t("dashboard.aiVsHuman.human")}
              aiLabel={t("dashboard.aiVsHuman.ai")}
              human={data.cascadeRate.human}
              ai={data.cascadeRate.ai}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Tool breakdown */}
          {data.toolBreakdown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("dashboard.aiVsHuman.toolsTitle")}</CardTitle>
                <CardDescription>
                  {t("dashboard.aiVsHuman.toolsSubtitle")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer
                  width="100%"
                  height={Math.max(data.toolBreakdown.length * 32, 80)}
                >
                  <BarChart
                    data={data.toolBreakdown}
                    layout="vertical"
                    margin={{ left: 0, right: 10 }}
                  >
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="tool"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                      width={80}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "0.5rem",
                        fontSize: 12,
                        color: "var(--foreground)",
                      }}
                      labelStyle={{ color: "var(--foreground)" }}
                      itemStyle={{ color: "var(--muted-foreground)" }}
                      formatter={(v) => [
                        t("dashboard.aiVsHuman.toolsTooltip", {
                          count: Number(v),
                        }),
                        t("dashboard.aiVsHuman.toolsDetectedIn"),
                      ]}
                    />
                    <Bar
                      dataKey="commits"
                      fill="var(--color-primary)"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Attribution gap */}
          {data.attributionGap && data.attributionGap.flaggedCommits > 0 && (
            <Card className="border-signal-yellow/30">
              <CardContent className="pt-4">
                <p className="text-sm font-medium text-signal-yellow">
                  {t("dashboard.aiVsHuman.attributionGapTitle")}
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {data.attributionGap.flaggedPct.toFixed(0)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("dashboard.aiVsHuman.attributionGapDescription", {
                    flagged: data.attributionGap.flaggedCommits,
                    total: data.attributionGap.totalHumanCommits,
                  })}
                </p>
                {tenantSlug && (
                  <Link
                    href={`/${tenantSlug}/ai-exposure`}
                    className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                  >
                    {t("dashboard.aiVsHuman.attributionGapCta")}
                  </Link>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}
