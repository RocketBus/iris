"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  AreaChart,
  Area,
} from "recharts";

import { MetricLineChart } from "@/components/charts/MetricLineChart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { TimeSeriesPoint, AIImpactPoint } from "@/types/temporal";

interface PayloadInsights {
  intentDistribution?: Record<string, number>;
  originDistribution?: Record<string, number>;
  stabilizationByOrigin?: Record<
    string,
    { stabilization_ratio: number; files_touched: number }
  >;
  cascadeRate?: number;
  cascadeMedianDepth?: number;
  cascadeByOrigin?: Record<
    string,
    { cascade_rate: number; cascades: number; total_commits: number }
  >;
  durabilityByOrigin?: Record<
    string,
    {
      survival_rate: number;
      lines_introduced: number;
      lines_surviving: number;
      median_age_days: number;
    }
  >;
  activityTimeline?: Array<{
    week_start: string;
    commits: number;
    lines_changed: number;
    intent?: Record<string, number>;
    origin?: Record<string, number>;
  }>;
}

interface RepoChartsProps {
  timeSeries: TimeSeriesPoint[];
  insights: PayloadInsights;
  aiImpact?: AIImpactPoint[];
}

const intentColors: Record<string, string> = {
  FEATURE: "bg-signal-purple",
  FIX: "bg-signal-yellow",
  REFACTOR: "bg-primary",
  CONFIG: "bg-muted-foreground",
  UNKNOWN: "bg-signal-gray",
};

function DistributionBar({
  data,
  labels,
  colors,
}: {
  data: Record<string, number>;
  labels: Record<string, string>;
  colors: Record<string, string>;
}) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const order = Object.keys(labels);

  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full">
        {order.map((key) => {
          const value = data[key] ?? 0;
          if (value === 0) return null;
          const pct = (value / total) * 100;
          return (
            <div
              key={key}
              className={cn("h-full", colors[key] ?? "bg-muted")}
              style={{ width: `${pct}%` }}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {order.map((key) => {
          const value = data[key] ?? 0;
          if (value === 0) return null;
          const pct = ((value / total) * 100).toFixed(0);
          return (
            <div key={key} className="flex items-center gap-1.5">
              <div
                className={cn("size-2 rounded-full", colors[key] ?? "bg-muted")}
              />
              <span>
                {labels[key] ?? key} {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}`;
}

function ComparisonChart({
  data,
  humanKey,
  aiKey,
  title,
  description,
  humanLabel,
  aiLabel,
  format = "pct",
}: {
  data: AIImpactPoint[];
  humanKey: keyof AIImpactPoint;
  aiKey: keyof AIImpactPoint;
  title: string;
  description: string;
  humanLabel: string;
  aiLabel: string;
  format?: "pct" | "number";
}) {
  const hasData = data.some((p) => p[humanKey] !== null || p[aiKey] !== null);
  if (!hasData) return null;

  const formatValue = (v: number) =>
    format === "pct" ? `${(v * 100).toFixed(0)}%` : v.toFixed(0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-chart-grid)"
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
              tickFormatter={formatValue}
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
              }}
              labelFormatter={(label) => formatDate(String(label))}
              formatter={(value, name) => [
                formatValue(Number(value)),
                String(name) === humanKey ? humanLabel : aiLabel,
              ]}
            />
            <Legend
              formatter={(value) => (value === humanKey ? humanLabel : aiLabel)}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey={humanKey}
              stroke="var(--muted-foreground)"
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey={aiKey}
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function CommitMixChart({
  data,
  title,
  description,
  humanLabel,
  aiLabel,
}: {
  data: AIImpactPoint[];
  title: string;
  description: string;
  humanLabel: string;
  aiLabel: string;
}) {
  const hasData = data.some(
    (p) => p.commits_human !== null || p.commits_ai !== null,
  );
  if (!hasData) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-chart-grid)"
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
              }}
              labelFormatter={(label) => formatDate(String(label))}
              formatter={(value, name) => [
                Number(value).toFixed(0),
                String(name) === "commits_human" ? humanLabel : aiLabel,
              ]}
            />
            <Legend
              formatter={(value) =>
                value === "commits_human" ? humanLabel : aiLabel
              }
              wrapperStyle={{ fontSize: 12 }}
            />
            <Area
              type="monotone"
              dataKey="commits_human"
              stackId="1"
              fill="var(--muted-foreground)"
              fillOpacity={0.3}
              stroke="var(--muted-foreground)"
              strokeWidth={1.5}
            />
            <Area
              type="monotone"
              dataKey="commits_ai"
              stackId="1"
              fill="var(--color-primary)"
              fillOpacity={0.3}
              stroke="var(--color-primary)"
              strokeWidth={1.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function RepoCharts({
  timeSeries,
  insights,
  aiImpact,
}: RepoChartsProps) {
  const { t, language } = useTranslation();
  const intentLabels: Record<string, string> = {
    FEATURE: t("repoCharts.intent.labels.feature"),
    FIX: t("repoCharts.intent.labels.fix"),
    REFACTOR: t("repoCharts.intent.labels.refactor"),
    CONFIG: t("repoCharts.intent.labels.config"),
    UNKNOWN: t("repoCharts.intent.labels.unknown"),
  };
  const originLabels: Record<string, string> = {
    HUMAN: t("repoCharts.origin.labels.human"),
    AI_ASSISTED: t("repoCharts.origin.labels.ai"),
    BOT: t("repoCharts.origin.labels.bot"),
  };
  const numberLocale = language === "pt-BR" ? "pt-BR" : "en-US";

  const chartData = timeSeries.map((p) => ({
    date: p.date,
    stabilization_ratio: p.stabilization_ratio,
    revert_rate: p.revert_rate,
    churn_events: p.churn_events,
    commits_total: p.commits_total,
    ai_detection_coverage_pct: p.ai_detection_coverage_pct,
    cascade_rate: p.cascade_rate,
  }));

  const hasAI = timeSeries.some(
    (p) =>
      p.ai_detection_coverage_pct != null && p.ai_detection_coverage_pct > 0,
  );

  return (
    <div className="space-y-4">
      {/* Primary: Stabilization trend */}
      <Card>
        <CardHeader>
          <CardTitle>{t("repoCharts.stabilization.title")}</CardTitle>
          <CardDescription>
            {t("repoCharts.stabilization.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MetricLineChart
            data={chartData}
            dataKey="stabilization_ratio"
            label={t("repoCharts.stabilization.label")}
            color="var(--color-signal-purple)"
            format="pct"
            height={240}
          />
        </CardContent>
      </Card>

      {/* Intent + Origin distribution */}
      <div
        className={cn(
          "grid gap-4",
          insights.intentDistribution && insights.originDistribution
            ? "md:grid-cols-2"
            : "md:grid-cols-1",
        )}
      >
        {insights.intentDistribution && (
          <Card>
            <CardHeader>
              <CardTitle>{t("repoCharts.intent.title")}</CardTitle>
              <CardDescription>
                {t("repoCharts.intent.subtitle")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DistributionBar
                data={insights.intentDistribution}
                labels={intentLabels}
                colors={intentColors}
              />
              <div className="mt-3 space-y-1">
                {Object.entries(insights.intentDistribution)
                  .sort(([, a], [, b]) => b - a)
                  .map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {intentLabels[key] ?? key}
                      </span>
                      <span className="font-mono">{value}</span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {insights.originDistribution && (
          <Card>
            <CardHeader>
              <CardTitle>{t("repoCharts.origin.title")}</CardTitle>
              <CardDescription>
                {t("repoCharts.origin.subtitle")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DistributionBar
                data={insights.originDistribution}
                labels={originLabels}
                colors={{
                  HUMAN: "bg-muted-foreground",
                  AI_ASSISTED: "bg-primary",
                  BOT: "bg-signal-gray",
                }}
              />
              {insights.stabilizationByOrigin && (
                <div className="mt-3">
                  <p className="mb-1 text-xs text-muted-foreground">
                    {t("repoCharts.origin.stabByOrigin")}
                  </p>
                  <div className="space-y-1">
                    {Object.entries(insights.stabilizationByOrigin).map(
                      ([origin, data]) => (
                        <div
                          key={origin}
                          className="flex justify-between text-sm"
                        >
                          <span className="text-muted-foreground">
                            {originLabels[origin] ?? origin}
                          </span>
                          <span className="font-mono">
                            {(data.stabilization_ratio * 100).toFixed(0)}%
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Secondary charts row */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("repoCharts.churn.title")}</CardTitle>
            <CardDescription>{t("repoCharts.churn.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <MetricLineChart
              data={chartData}
              dataKey="churn_events"
              label={t("repoCharts.churn.label")}
              color="var(--color-signal-yellow)"
              format="number"
              height={180}
            />
          </CardContent>
        </Card>

        {hasAI ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("repoCharts.aiAdoption.title")}</CardTitle>
              <CardDescription>
                {t("repoCharts.aiAdoption.subtitle")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MetricLineChart
                data={chartData}
                dataKey="ai_detection_coverage_pct"
                label={t("repoCharts.aiAdoption.label")}
                color="var(--color-primary)"
                format="pct_raw"
                height={180}
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t("repoCharts.commits.title")}</CardTitle>
              <CardDescription>
                {t("repoCharts.commits.subtitle")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MetricLineChart
                data={chartData}
                dataKey="commits_total"
                label={t("repoCharts.commits.label")}
                color="var(--color-muted-foreground)"
                format="number"
                height={180}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Correction Cascades + Code Durability */}
      {(insights.cascadeRate != null || insights.durabilityByOrigin) && (
        <div
          className={cn(
            "grid gap-4",
            insights.cascadeRate != null && insights.durabilityByOrigin
              ? "md:grid-cols-2"
              : "md:grid-cols-1",
          )}
        >
          {insights.cascadeRate != null && (
            <Card>
              <CardHeader>
                <CardTitle>{t("repoCharts.cascades.title")}</CardTitle>
                <CardDescription>
                  {t("repoCharts.cascades.subtitle")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("repoCharts.cascades.rate")}
                  </span>
                  <span className="font-mono">
                    {(insights.cascadeRate * 100).toFixed(0)}%
                  </span>
                </div>
                {insights.cascadeMedianDepth != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {t("repoCharts.cascades.medianDepth")}
                    </span>
                    <span className="font-mono">
                      {t("repoCharts.cascades.depthFixes", {
                        value: insights.cascadeMedianDepth.toFixed(1),
                      })}
                    </span>
                  </div>
                )}
                {insights.cascadeByOrigin &&
                  Object.entries(insights.cascadeByOrigin).map(
                    ([origin, data]) => (
                      <div
                        key={origin}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-muted-foreground">
                          {originLabels[origin] ?? origin}
                        </span>
                        <span className="font-mono">
                          {t("repoCharts.cascades.byOrigin", {
                            pct: (data.cascade_rate * 100).toFixed(0),
                            cascades: data.cascades,
                            total: data.total_commits,
                          })}
                        </span>
                      </div>
                    ),
                  )}
              </CardContent>
            </Card>
          )}

          {insights.durabilityByOrigin && (
            <Card>
              <CardHeader>
                <CardTitle>{t("repoCharts.durability.title")}</CardTitle>
                <CardDescription>
                  {t("repoCharts.durability.subtitle")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(insights.durabilityByOrigin).map(
                  ([origin, data]) => (
                    <div key={origin} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {originLabels[origin] ?? origin}
                        </span>
                        <span className="font-mono">
                          {t("repoCharts.durability.survival", {
                            pct: (data.survival_rate * 100).toFixed(0),
                          })}
                        </span>
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>
                          {t("repoCharts.durability.introduced", {
                            count:
                              data.lines_introduced.toLocaleString(
                                numberLocale,
                              ),
                          })}
                        </span>
                        <span>
                          {t("repoCharts.durability.surviving", {
                            count:
                              data.lines_surviving.toLocaleString(numberLocale),
                          })}
                        </span>
                        <span>
                          {t("repoCharts.durability.medianAge", {
                            days: data.median_age_days.toFixed(0),
                          })}
                        </span>
                      </div>
                    </div>
                  ),
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Activity timeline */}
      {insights.activityTimeline && insights.activityTimeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("repoCharts.weeklyActivity.title")}</CardTitle>
            <CardDescription>
              {t("repoCharts.weeklyActivity.subtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4">
                      {t("repoCharts.weeklyActivity.columns.week")}
                    </th>
                    <th className="pb-2 pr-4">
                      {t("repoCharts.weeklyActivity.columns.commits")}
                    </th>
                    <th className="pb-2 pr-4">
                      {t("repoCharts.weeklyActivity.columns.loc")}
                    </th>
                    <th className="pb-2 pr-4">
                      {t("repoCharts.weeklyActivity.columns.feature")}
                    </th>
                    <th className="pb-2 pr-4">
                      {t("repoCharts.weeklyActivity.columns.fix")}
                    </th>
                    <th className="pb-2">
                      {t("repoCharts.weeklyActivity.columns.aiPct")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {insights.activityTimeline.map((w) => {
                    const intent = w.intent ?? {};
                    const totalIntent =
                      Object.values(intent).reduce((a, b) => a + b, 0) || 1;
                    const origin = w.origin ?? {};
                    const totalOrigin =
                      Object.values(origin).reduce((a, b) => a + b, 0) || 1;
                    return (
                      <tr
                        key={w.week_start}
                        className="border-b border-border/50"
                      >
                        <td className="py-2 pr-4">{w.week_start.slice(5)}</td>
                        <td className="py-2 pr-4">{w.commits}</td>
                        <td className="py-2 pr-4">
                          {w.lines_changed.toLocaleString(numberLocale)}
                        </td>
                        <td className="py-2 pr-4">
                          {(
                            ((intent.FEATURE ?? 0) / totalIntent) *
                            100
                          ).toFixed(0)}
                          %
                        </td>
                        <td className="py-2 pr-4">
                          {(((intent.FIX ?? 0) / totalIntent) * 100).toFixed(0)}
                          %
                        </td>
                        <td className="py-2">
                          {(
                            ((origin.AI_ASSISTED ?? 0) / totalOrigin) *
                            100
                          ).toFixed(0)}
                          %
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Impact — temporal comparison of Human vs AI-assisted code */}
      {aiImpact && aiImpact.length >= 2 && (
        <>
          <div className="pt-2">
            <h2 className="text-lg font-medium">
              {t("repoCharts.aiImpact.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("repoCharts.aiImpact.subtitle")}
            </p>
          </div>

          <CommitMixChart
            data={aiImpact}
            title={t("repoCharts.commitMix.title")}
            description={t("repoCharts.commitMix.subtitle")}
            humanLabel={t("repoCharts.commitMix.human")}
            aiLabel={t("repoCharts.commitMix.ai")}
          />

          <div className="grid gap-4 md:grid-cols-2 [&>:only-child]:md:col-span-2">
            <ComparisonChart
              data={aiImpact}
              humanKey="stabilization_human"
              aiKey="stabilization_ai"
              title={t("repoCharts.compare.stabilizationTitle")}
              description={t("repoCharts.compare.stabilizationSubtitle")}
              humanLabel={t("repoCharts.commitMix.human")}
              aiLabel={t("repoCharts.commitMix.ai")}
            />
            <ComparisonChart
              data={aiImpact}
              humanKey="durability_human"
              aiKey="durability_ai"
              title={t("repoCharts.compare.durabilityTitle")}
              description={t("repoCharts.compare.durabilitySubtitle")}
              humanLabel={t("repoCharts.commitMix.human")}
              aiLabel={t("repoCharts.commitMix.ai")}
            />
          </div>

          <ComparisonChart
            data={aiImpact}
            humanKey="cascade_human"
            aiKey="cascade_ai"
            title={t("repoCharts.compare.cascadesTitle")}
            description={t("repoCharts.compare.cascadesSubtitle")}
            humanLabel={t("repoCharts.commitMix.human")}
            aiLabel={t("repoCharts.commitMix.ai")}
          />
        </>
      )}
    </div>
  );
}
