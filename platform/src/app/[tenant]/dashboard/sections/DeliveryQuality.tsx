"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";

import { MetricCard } from "@/components/charts/MetricCard";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import type { DeliveryQuality as DeliveryQualityData } from "@/types/org-summary";

interface DeliveryQualityProps {
  data: DeliveryQualityData;
}

function stabColor(value: number): string {
  if (value >= 0.7) return "var(--color-signal-purple)";
  if (value >= 0.5) return "var(--color-signal-yellow)";
  return "var(--color-signal-red)";
}

export function DeliveryQuality({ data }: DeliveryQualityProps) {
  const { t } = useTranslation();
  if (data.reposWithData === 0) return null;

  const sorted = [...data.stabilizationDistribution].sort(
    (a, b) => b.value - a.value,
  );

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">{t("dashboard.quality.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("dashboard.quality.subtitle", { count: data.reposWithData })}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Stabilization distribution */}
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.quality.distributionTitle")}</CardTitle>
            <CardDescription>
              {t("dashboard.quality.distributionSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sorted} layout="vertical">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-chart-grid)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  domain={[0, 1]}
                  tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <Tooltip
                  content={({ payload }) => {
                    const p = payload?.[0]?.payload as
                      | { name: string; value: number }
                      | undefined;
                    if (!p) return null;
                    return (
                      <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground shadow-md">
                        <p className="font-medium">{p.name}</p>
                        <p className="text-muted-foreground">
                          {t("dashboard.quality.stabTooltip", {
                            pct: (p.value * 100).toFixed(0),
                          })}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {sorted.map((entry) => (
                    <Cell key={entry.name} fill={stabColor(entry.value)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Quality metric cards */}
        <div className="grid gap-3 grid-cols-2 content-start">
          <MetricCard
            label={t("dashboard.quality.revertRate")}
            value={
              data.revertRate !== null
                ? `${(data.revertRate * 100).toFixed(1)}%`
                : "\u2014"
            }
            invertDelta
          />
          <MetricCard
            label={t("dashboard.quality.cascadeRate")}
            value={
              data.cascadeRate !== null
                ? `${(data.cascadeRate * 100).toFixed(0)}%`
                : "\u2014"
            }
            invertDelta
          />
          <MetricCard
            label={t("dashboard.quality.fixLatency")}
            value={
              data.fixLatencyMedianHours !== null
                ? `${data.fixLatencyMedianHours.toFixed(0)}h`
                : "\u2014"
            }
            invertDelta
          />
          <MetricCard
            label={t("dashboard.quality.newCodeChurn")}
            value={
              data.newCodeChurnRate2w !== null
                ? `${(data.newCodeChurnRate2w * 100).toFixed(0)}%`
                : "\u2014"
            }
            invertDelta
          />
        </div>
      </div>
    </section>
  );
}
