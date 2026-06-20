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

import { FlowPhaseBar } from "@/components/charts/FlowPhaseBar";
import { MetricCard } from "@/components/charts/MetricCard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import {
  selectCycleTimeVerdict,
  type CycleTimeVerdict,
} from "@/lib/queries/cycle-time-flow";
import { cn } from "@/lib/utils";
import type { CycleTimeData, FlowPhaseKey } from "@/types/org-summary";

// The verdict banner is only shown once cycle-time data is dense enough
// to make a confident statement. Below this many merged PRs we still
// render the section but hide the headline.
const INSIGHT_MIN_MERGED = 50;

// Below this coverage the phase decomposition is shown as a partial sample,
// never as a verdict. See selectCycleTimeVerdict.
const COVERAGE_FLOOR = 0.6;

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
  const verdict = selectCycleTimeVerdict(
    {
      totalPRsMerged: data.totalPRsMerged,
      pctMergedWithin24h: data.pctMergedWithin24h,
      flow: data.flow,
    },
    { minMerged: INSIGHT_MIN_MERGED, coverageFloor: COVERAGE_FLOOR },
  );
  const verdictText = buildVerdictText(verdict, data, t);

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

      {verdictText && (
        <Card
          className={cn(
            verdictText.tone === "signal"
              ? "border-signal-green/30 bg-signal-green/5"
              : "border-border bg-muted/30",
          )}
        >
          <CardContent className="flex items-start gap-3 py-4">
            <Zap
              className={cn(
                "mt-0.5 size-5 shrink-0",
                verdictText.tone === "signal"
                  ? "text-signal-yellow"
                  : "text-muted-foreground",
              )}
            />
            <p className="text-sm">{verdictText.text}</p>
          </CardContent>
        </Card>
      )}

      {data.flow && verdict.dominantPhase && (
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.cycleTime.flowBarTitle")}</CardTitle>
            <CardDescription>
              {t("dashboard.cycleTime.flowBarSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FlowPhaseBar
              phaseHours={data.flow.phaseMedianHours}
              labels={phaseLabels(t)}
              formatHours={formatHoursAsDays}
              dominantKey={verdict.dominantPhase.key}
            />
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

type Translate = (
  path: string,
  params?: Record<string, string | number>,
) => string;

function phaseLabels(t: Translate): Record<FlowPhaseKey, string> {
  return {
    coding: t("dashboard.cycleTime.phaseLabels.coding"),
    awaiting_first_review: t(
      "dashboard.cycleTime.phaseLabels.awaiting_first_review",
    ),
    in_review_active: t("dashboard.cycleTime.phaseLabels.in_review_active"),
    in_review_wait: t("dashboard.cycleTime.phaseLabels.in_review_wait"),
    awaiting_merge: t("dashboard.cycleTime.phaseLabels.awaiting_merge"),
  };
}

type VerdictText = { text: string; tone: "signal" | "muted" };

/**
 * Turn a computed verdict into the banner copy. Only ever describes the code
 * window it measured — never claims anything about "before" or "after".
 */
function buildVerdictText(
  verdict: CycleTimeVerdict,
  data: CycleTimeData,
  t: Translate,
): VerdictText | null {
  if (verdict.variant === "none") return null;

  const median = formatHoursAsDays(data.medianHours);
  const pct = formatPct(data.pctMergedWithin24h);

  if (verdict.variant === "noFlow") {
    return {
      tone: "muted",
      text: t("dashboard.cycleTime.verdictNoFlow", { median, pct }),
    };
  }

  const dp = verdict.dominantPhase;
  if (!dp) return null;
  const phase = phaseLabels(t)[dp.key];
  const phaseHours = formatHoursAsDays(dp.hours);
  const coverage =
    verdict.flowCoveragePct !== null
      ? `${Math.round(verdict.flowCoveragePct * 100)}%`
      : "—";

  if (verdict.variant === "lowCoverage") {
    return {
      tone: "muted",
      text: t("dashboard.cycleTime.verdictLowCoverage", {
        coverage,
        phase,
        phaseHours,
      }),
    };
  }

  const waitTag = dp.isWait ? t("dashboard.cycleTime.waitTag") : "";
  return {
    tone: "signal",
    text: t("dashboard.cycleTime.verdict", {
      phase,
      waitTag,
      phaseHours,
      sharePct: `${dp.sharePct.toFixed(0)}%`,
      median,
      pct,
      n: verdict.prsWithFlow ?? 0,
      coverage,
    }),
  };
}
