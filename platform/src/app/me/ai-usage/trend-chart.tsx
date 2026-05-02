'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { UsageTrendPoint } from '@/lib/queries/personal-ai-usage';

interface TrendChartProps {
  data: UsageTrendPoint[];
  locale: string;
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    month: 'short',
    day: '2-digit',
  });
}

export function TrendChart({ data, locale }: TrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => formatDate(String(v), locale)}
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={32}
        />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
          width={38}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
            fontSize: 12,
            color: 'var(--foreground)',
          }}
          labelFormatter={(label) => formatDate(String(label), locale)}
          formatter={(value) => [`${Number(value).toFixed(0)}%`, '']}
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
