"use client";

import { Zap } from "lucide-react";
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import type { CycleTimeData } from "@/types/org-summary";

// Insight banner is only shown once cycle-time data is dense enough
// to make a confident statement. Below this many merged PRs we still
// render the section but hide the headline.
const INSIGHT_MIN_MERGED = 50;

// Cutoffs for the "% merged within 24h" bar color ramp. Tuned so a repo that
// ships in a day most of the time reads green, "mixed" reads yellow, and slow
// repos read orange.
const FAST_GREEN_PCT = 0.8;
const MID_YELLOW_PCT = 0.65;
const SLOW_ORANGE_PCT = 0.5;

// Match the Stabilization Distribution chart for a consistent dashboard look.
const CHART_HEIGHT = 200;
const Y_AXIS_WIDTH = 170;
const AXIS_TICK = { fontSize: 10, fill: "var(--color-muted-foreground)" };

// Cycle-time buckets, in fastest→slowest order, shared by the stacked bars,
// the tooltip, and the legend.
const BUCKETS = [
  {
    key: "same_day",
    labelKey: "sameDay",
    color: "var(--color-bucket-same-day)",
  },
  { key: "one_day", labelKey: "oneDay", color: "var(--color-bucket-one-day)" },
  {
    key: "two_to_three_days",
    labelKey: "twoThree",
    color: "var(--color-bucket-two-three)",
  },
  {
    key: "four_to_seven_days",
    labelKey: "fourSeven",
    color: "var(--color-bucket-four-seven)",
  },
  {
    key: "seven_plus_days",
    labelKey: "sevenPlus",
    color: "var(--color-bucket-seven-plus)",
  },
] as const;

type RepoRow = CycleTimeData["perRepo"][number];

interface CycleTimeProps {
  data: CycleTimeData;
}

export function CycleTime({ data }: CycleTimeProps) {
  const { t } = useTranslation();
  const showInsight =
    data.totalPRsMerged >= INSIGHT_MIN_MERGED &&
    data.pctMergedWithin24h !== null;

  return (
    <section className="space-y-4">
      <div className="border-l-4 border-primary pl-3">
        <h2 className="text-lg font-medium">
          {t("dashboard.cycleTime.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("dashboard.cycleTime.subtitle")}
        </p>
      </div>

      {showInsight && (
        <Card className="border-signal-green/30 bg-signal-green/5">
          <CardContent className="flex items-start gap-3 py-4">
            <Zap className="mt-0.5 size-5 shrink-0 text-signal-yellow" />
            <p className="text-sm">
              {t("dashboard.cycleTime.insight", {
                pct: formatPct(data.pctMergedWithin24h),
                median: formatHoursAsDays(data.medianHours),
              })}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t("dashboard.cycleTime.kpi.pctWithin24h")}
          value={formatPct(data.pctMergedWithin24h)}
        />
        <MetricCard
          label={t("dashboard.cycleTime.kpi.median")}
          value={formatHoursAsDays(data.medianHours)}
        />
        <MetricCard
          label={t("dashboard.cycleTime.kpi.mean")}
          value={formatHoursAsDays(data.meanHours)}
        />
        <MetricCard
          label={t("dashboard.cycleTime.kpi.p90")}
          value={formatHoursAsDays(data.p90Hours)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              {t("dashboard.cycleTime.charts.ranking.title")}
            </CardTitle>
            <CardDescription>
              {t("dashboard.cycleTime.charts.ranking.subtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RankingChart rows={data.perRepo} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {t("dashboard.cycleTime.charts.distribution.title")}
            </CardTitle>
            <CardDescription>
              {t("dashboard.cycleTime.charts.distribution.subtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <DistributionChart rows={data.perRepo} />
            <DistributionLegend />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function truncateRepo(value: string): string {
  return value.length > 26 ? `…${value.slice(-25)}` : value;
}

const tickPct = (v: number) => `${(v * 100).toFixed(0)}%`;

function rampColor(pct: number): string {
  if (pct >= FAST_GREEN_PCT) return "var(--color-signal-green)";
  if (pct >= MID_YELLOW_PCT) return "var(--color-bucket-one-day)";
  if (pct >= SLOW_ORANGE_PCT) return "var(--color-signal-yellow)";
  return "var(--color-bucket-four-seven)";
}

/** Single bar per repo — share of PRs merged within a day. Mirrors the
 * Stabilization Distribution chart (horizontal Recharts bars + % axis). */
function RankingChart({ rows }: { rows: RepoRow[] }) {
  const { t } = useTranslation();
  const data = [...rows].sort((a, b) => b.pctWithin24h - a.pctWithin24h);

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-chart-grid)"
          horizontal={false}
        />
        <XAxis
          type="number"
          domain={[0, 1]}
          tickFormatter={tickPct}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={Y_AXIS_WIDTH}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          tickFormatter={truncateRepo}
        />
        <Tooltip
          content={({ payload }) => {
            const p = payload?.[0]?.payload as RepoRow | undefined;
            if (!p) return null;
            return (
              <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground shadow-md">
                <p className="font-medium">{p.name}</p>
                <p className="text-muted-foreground">
                  {formatPct(p.pctWithin24h)} ·{" "}
                  {t("dashboard.cycleTime.tooltips.ranking", {
                    merged: p.merged,
                  })}
                </p>
              </div>
            );
          }}
        />
        <Bar dataKey="pctWithin24h" radius={[0, 4, 4, 0]}>
          {data.map((row) => (
            <Cell key={row.name} fill={rampColor(row.pctWithin24h)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Stacked bar per repo — cycle-time bucket mix normalized to 100%. Same
 * Recharts horizontal layout as the ranking chart. */
function DistributionChart({ rows }: { rows: RepoRow[] }) {
  const { t } = useTranslation();
  const data = [...rows]
    .sort((a, b) => b.pctWithin24h - a.pctWithin24h)
    .map((row) => {
      const total = BUCKETS.reduce((sum, b) => sum + row.buckets[b.key], 0);
      const out: Record<string, number | string> = { name: row.name };
      for (const b of BUCKETS) {
        out[b.key] = total > 0 ? row.buckets[b.key] / total : 0;
      }
      return out;
    })
    .filter((d) => BUCKETS.some((b) => (d[b.key] as number) > 0));

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-chart-grid)"
          horizontal={false}
        />
        <XAxis
          type="number"
          domain={[0, 1]}
          tickFormatter={tickPct}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={Y_AXIS_WIDTH}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          tickFormatter={truncateRepo}
        />
        <Tooltip
          content={({ payload }) => {
            const p = payload?.[0]?.payload as
              | Record<string, number | string>
              | undefined;
            if (!p) return null;
            return (
              <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground shadow-md">
                <p className="font-medium">{p.name as string}</p>
                {BUCKETS.map((b) => {
                  const frac = (p[b.key] as number) ?? 0;
                  if (frac <= 0) return null;
                  return (
                    <p
                      key={b.key}
                      className="flex items-center gap-1.5 text-muted-foreground"
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: b.color }}
                      />
                      {t(`dashboard.cycleTime.buckets.${b.labelKey}`)}:{" "}
                      {(frac * 100).toFixed(0)}%
                    </p>
                  );
                })}
              </div>
            );
          }}
        />
        {BUCKETS.map((b) => (
          <Bar key={b.key} dataKey={b.key} stackId="a" fill={b.color} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function DistributionLegend() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs text-muted-foreground">
      {BUCKETS.map((b) => (
        <span key={b.key} className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: b.color }}
          />
          {t(`dashboard.cycleTime.buckets.${b.labelKey}`)}
        </span>
      ))}
    </div>
  );
}

function formatPct(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(1).replace(".", ",")}%`;
}

function formatHoursAsDays(hours: number | null): string {
  if (hours === null || hours === undefined) return "—";
  const days = hours / 24;
  if (days < 1) return `${hours.toFixed(0)} h`;
  const rounded = Math.round(days * 10) / 10;
  // Show "5 dias" not "5,0 dias" when the value is integral.
  const label = Number.isInteger(rounded)
    ? rounded.toFixed(0)
    : rounded.toFixed(1).replace(".", ",");
  return `${label} d`;
}
