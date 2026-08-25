"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatChartDate } from "@/lib/date-format";
import type { UsageTrendPoint } from "@/lib/queries/personal-ai-usage";

interface TrendChartProps {
  data: UsageTrendPoint[];
  locale: string;
}

export function TrendChart({ data, locale }: TrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-chart-grid)"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => formatChartDate(String(v), locale)}
          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={32}
        />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
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
          labelFormatter={(label) => formatChartDate(String(label), locale)}
          formatter={(value) => [`${Number(value).toFixed(0)}%`, ""]}
        />
        <Area
          type="monotone"
          dataKey="aiCommitPct"
          stroke="var(--color-primary)"
          fill="var(--color-primary)"
          fillOpacity={0.2}
          strokeWidth={1.5}
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
