"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import type { OrgTimelineWeek } from "@/types/org-summary";

interface OrgTimelineProps {
  data: OrgTimelineWeek[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}`;
}

export function OrgTimeline({ data }: OrgTimelineProps) {
  const { t } = useTranslation();
  if (data.length < 2) return null;

  // The right axis shows percentages with `(v * 100).toFixed(0)%`. Stabilization
  // is a 0..1 decimal so the multiplication is correct, but aiPct arrives
  // already in percent (0..100). Normalize it to the same 0..1 scale so the
  // shared axis doesn't render labels like "10000%".
  const normalizedData = data.map((d) => ({
    ...d,
    aiPctNorm: d.aiPct == null ? null : Number(d.aiPct) / 100,
  }));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">
          {t("dashboard.orgTimeline.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("dashboard.orgTimeline.subtitle")}
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={normalizedData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                vertical={false}
              />
              <XAxis
                dataKey="weekStart"
                tickFormatter={(v) => formatDate(String(v))}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={32}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={38}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 1]}
                tickFormatter={(v) => `${(Number(v) * 100).toFixed(0)}%`}
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
                formatter={(value, name) => {
                  const v = Number(value);
                  if (name === "commits")
                    return [v.toFixed(0), t("dashboard.orgTimeline.commits")];
                  if (name === "stabilization")
                    return [
                      `${(v * 100).toFixed(0)}%`,
                      t("dashboard.orgTimeline.stabilization"),
                    ];
                  if (name === "aiPctNorm")
                    return [
                      `${(v * 100).toFixed(0)}%`,
                      t("dashboard.orgTimeline.aiAdoption"),
                    ];
                  return [v, String(name)];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                yAxisId="left"
                dataKey="commits"
                name={t("dashboard.orgTimeline.commits")}
                fill="var(--color-cat-6)"
                fillOpacity={0.7}
                radius={[2, 2, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="stabilization"
                name={t("dashboard.orgTimeline.stabilization")}
                stroke="var(--color-cat-2)"
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="aiPctNorm"
                name={t("dashboard.orgTimeline.aiAdoption")}
                stroke="var(--color-cat-1)"
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </section>
  );
}
