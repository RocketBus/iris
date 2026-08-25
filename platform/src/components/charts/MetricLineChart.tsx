"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

import { useTranslation } from "@/hooks/useTranslation";
import { formatChartDate } from "@/lib/date-format";

interface DataPoint {
  date: string;
  [key: string]: string | number | null;
}

interface MetricLineChartProps {
  data: DataPoint[];
  dataKey: string;
  label: string;
  color?: string;
  format?: "pct" | "pct_raw" | "number" | "hours";
  height?: number;
}

function formatValue(value: number, format: string): string {
  switch (format) {
    case "pct":
      return `${(value * 100).toFixed(0)}%`;
    case "pct_raw":
      return value < 10 ? `${value.toFixed(1)}%` : `${value.toFixed(0)}%`;
    case "hours":
      return `${value.toFixed(1)}h`;
    default:
      return value.toFixed(0);
  }
}

export function MetricLineChart({
  data,
  dataKey,
  label,
  color = "var(--color-primary)",
  format = "pct",
  height = 200,
}: MetricLineChartProps) {
  const { language } = useTranslation();

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        No data yet
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-muted-foreground">{label}</p>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-chart-grid)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => formatChartDate(String(v), language)}
            tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={32}
          />
          <YAxis
            tickFormatter={(v) => formatValue(v, format)}
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
            }}
            labelFormatter={(label) => formatChartDate(String(label), language)}
            formatter={(value) => [formatValue(Number(value), format), label]}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3, fill: color }}
            activeDot={{ r: 5 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
