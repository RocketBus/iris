"use client";

import {
  AreaChart,
  Area,
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
import { cn } from "@/lib/utils";
import type { IntentData } from "@/types/org-summary";

interface IntentDistributionProps {
  data: IntentData;
}

// Map intents to the categorical palette. Five intents, five distinct hues —
// otherwise FEATURE and REFACTOR previously collapsed to the same brand
// purple because both signal-purple and primary resolve to #a528ff.
const intentColors: Record<string, string> = {
  FEATURE: "bg-[var(--color-cat-1)]",
  FIX: "bg-[var(--color-cat-3)]",
  REFACTOR: "bg-[var(--color-cat-2)]",
  CONFIG: "bg-[var(--color-cat-6)]",
  UNKNOWN: "bg-[var(--color-cat-4)]",
};

const intentChartColors: Record<string, string> = {
  FEATURE: "var(--color-cat-1)",
  FIX: "var(--color-cat-3)",
  REFACTOR: "var(--color-cat-2)",
  CONFIG: "var(--color-cat-6)",
  UNKNOWN: "var(--color-cat-4)",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}`;
}

export function IntentDistribution({ data }: IntentDistributionProps) {
  const { t } = useTranslation();
  const intentLabels: Record<string, string> = {
    FEATURE: t("dashboard.intent.labels.feature"),
    FIX: t("dashboard.intent.labels.fix"),
    REFACTOR: t("dashboard.intent.labels.refactor"),
    CONFIG: t("dashboard.intent.labels.config"),
    UNKNOWN: t("dashboard.intent.labels.unknown"),
  };
  const total = Object.values(data.distribution).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const order = ["FEATURE", "FIX", "REFACTOR", "CONFIG", "UNKNOWN"];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">{t("dashboard.intent.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("dashboard.intent.subtitle", { count: data.reposWithData })}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Distribution bar + breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.intent.commitIntentsTitle")}</CardTitle>
            <CardDescription>
              {t("dashboard.intent.commitIntentsSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stacked bar */}
            <div className="flex h-3 overflow-hidden rounded-full">
              {order.map((key) => {
                const value = data.distribution[key] ?? 0;
                if (value === 0) return null;
                const pct = (value / total) * 100;
                return (
                  <div
                    key={key}
                    className={cn("h-full", intentColors[key] ?? "bg-muted")}
                    style={{ width: `${pct}%` }}
                  />
                );
              })}
            </div>

            {/* Legend + counts */}
            <div className="space-y-1.5">
              {order.map((key) => {
                const value = data.distribution[key] ?? 0;
                if (value === 0) return null;
                const pct = ((value / total) * 100).toFixed(0);
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={cn("size-2 rounded-full", intentColors[key])}
                      />
                      <span className="text-muted-foreground">
                        {intentLabels[key]}
                      </span>
                    </div>
                    <span className="font-mono">
                      {value.toLocaleString()} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Feature-to-Fix ratio */}
            {data.featureToFixRatio !== null && (
              <div className="border-t border-border pt-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("dashboard.intent.featureToFix")}
                  </span>
                  <span className="font-mono text-lg font-bold">
                    {data.featureToFixRatio.toFixed(1)}:1
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {data.featureToFixRatio >= 1
                    ? t("dashboard.intent.buildingMore")
                    : t("dashboard.intent.fixingMore")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Intent trend over time */}
        {data.timeline.length >= 2 && (
          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.intent.intentTrendTitle")}</CardTitle>
              <CardDescription>
                {t("dashboard.intent.intentTrendSubtitle")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.timeline}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-chart-grid)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    tick={{
                      fontSize: 10,
                      fill: "var(--color-muted-foreground)",
                    }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={32}
                  />
                  <YAxis
                    tick={{
                      fontSize: 10,
                      fill: "var(--color-muted-foreground)",
                    }}
                    tickLine={false}
                    axisLine={false}
                    width={38}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "0.5rem",
                      fontSize: 12,
                      color: "var(--color-foreground)",
                    }}
                    labelStyle={{ color: "var(--color-foreground)" }}
                    itemStyle={{ color: "var(--color-muted-foreground)" }}
                    labelFormatter={(label) => formatDate(String(label))}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {order
                    .filter((k) => k !== "UNKNOWN")
                    .map((key) => (
                      <Area
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={intentLabels[key]}
                        stackId="1"
                        fill={intentChartColors[key]}
                        fillOpacity={0.3}
                        stroke={intentChartColors[key]}
                        strokeWidth={1.5}
                      />
                    ))}
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}
