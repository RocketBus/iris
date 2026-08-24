"use client";

import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type {
  AgingColumn,
  BoardFlowSummary,
  CfdPoint,
  FlowBalance,
  GateSeverity,
  LifecycleBucket,
  PercentileSet,
  PhaseStat,
  QualityReport,
  StalledItem,
} from "@/types/board-flow";

/**
 * Fixed bucket order and colour, from the product's validated categorical
 * ramp. Assigned by lifecycle stage and never cycled, so a bucket keeps its
 * colour when another one is absent from a board.
 *
 * The ramp passes CVD separation but sits below 3:1 against the surface, so
 * every mark here is paired with a visible label or a table — identity is never
 * carried by colour alone.
 */
const BUCKET_ORDER: LifecycleBucket[] = [
  "backlog",
  "discovery",
  "queue",
  "active",
  "done",
];

const BUCKET_COLOR: Record<LifecycleBucket, string> = {
  backlog: "var(--color-cat-6)",
  discovery: "var(--color-cat-3)",
  queue: "var(--color-cat-4)",
  active: "var(--color-cat-1)",
  done: "var(--color-cat-5)",
};

const BUCKET_BG: Record<LifecycleBucket, string> = {
  backlog: "bg-[var(--color-cat-6)]",
  discovery: "bg-[var(--color-cat-3)]",
  queue: "bg-[var(--color-cat-4)]",
  active: "bg-[var(--color-cat-1)]",
  done: "bg-[var(--color-cat-5)]",
};

/** Hours → a compact human duration. Days once it passes two of them. */
export function formatDuration(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 48)
    return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`;
  return `${(hours / 24).toFixed(hours / 24 < 10 ? 1 : 0)}d`;
}

// ---------------------------------------------------------------------------
// Quality gates — first on the page, by design
// ---------------------------------------------------------------------------

const GATE_ICON: Record<
  GateSeverity,
  React.ComponentType<{ className?: string }>
> = {
  ok: CheckCircle2,
  warning: CircleAlert,
  critical: AlertTriangle,
};

const GATE_TONE: Record<GateSeverity, string> = {
  ok: "text-signal-green",
  warning: "text-signal-yellow",
  critical: "text-signal-red",
};

export function QualityGates({ report }: { report: QualityReport }) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("boardFlow.quality.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("boardFlow.quality.subtitle")}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p
          className={cn(
            "text-sm font-medium",
            report.degraded ? "text-signal-red" : "text-muted-foreground",
          )}
        >
          {report.degraded
            ? t("boardFlow.quality.degraded")
            : t("boardFlow.quality.clean")}
        </p>

        <ul className="space-y-3">
          {report.gates.map((gate) => {
            const Icon = GATE_ICON[gate.severity];
            return (
              <li key={gate.id} className="flex gap-3">
                {/* Icon + text carry the state; colour only reinforces it. */}
                <Icon
                  className={cn(
                    "mt-0.5 size-4 flex-shrink-0",
                    GATE_TONE[gate.severity],
                  )}
                  aria-hidden
                />
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">
                    <span className="uppercase">{gate.severity}</span>
                    {" · "}
                    <span className="font-mono">{gate.id}</span>
                    {" · "}
                    {gate.value}
                    {gate.unit === "percent" ? "%" : ""}
                    {gate.affectedItemIds.length > 0 && (
                      <span className="ml-2 font-normal text-muted-foreground">
                        {t("boardFlow.quality.affected", {
                          count: gate.affectedItemIds.length,
                        })}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {gate.summary}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Lead time / cycle time / flow efficiency
// ---------------------------------------------------------------------------

function PercentileBlock({
  title,
  subtitle,
  set,
}: {
  title: string;
  subtitle: string;
  set: PercentileSet;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-4">
        {(["p50", "p70", "p85", "p95"] as const).map((key) => (
          <div key={key}>
            <p className="text-xs uppercase text-muted-foreground">{key}</p>
            <p className="font-mono text-lg font-medium">
              {formatDuration(set[key])}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("boardFlow.leadTime.sample", { count: set.n })}
        {set.suppressed.length > 0 && (
          <>
            {" · "}
            {t("boardFlow.leadTime.suppressed", {
              list: set.suppressed.join(", "),
            })}
          </>
        )}
      </p>
    </div>
  );
}

export function DurationSummary({ summary }: { summary: BoardFlowSummary }) {
  const { t } = useTranslation();
  const efficiency = summary.flowEfficiencyMedian;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("boardFlow.leadTime.title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-3">
        <PercentileBlock
          title={t("boardFlow.leadTime.title")}
          subtitle={t("boardFlow.leadTime.subtitle")}
          set={summary.leadTime}
        />
        <PercentileBlock
          title={t("boardFlow.leadTime.cycleTitle")}
          subtitle={t("boardFlow.leadTime.cycleSubtitle")}
          set={summary.cycleTime}
        />
        <div className="space-y-2">
          <div>
            <p className="text-sm font-medium">
              {t("boardFlow.leadTime.flowEfficiency")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("boardFlow.leadTime.flowEfficiencyHint")}
            </p>
          </div>
          <p className="font-mono text-3xl font-medium">
            {efficiency === null ? "—" : `${(efficiency * 100).toFixed(0)}%`}
          </p>
          {summary.coverage.itemsApproximated > 0 && (
            <p className="text-xs text-signal-yellow">
              {t("boardFlow.leadTime.approximate", {
                count: summary.coverage.itemsApproximated,
              })}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Time per column
// ---------------------------------------------------------------------------

export function PhaseBars({ phases }: { phases: PhaseStat[] }) {
  const { t } = useTranslation();

  if (phases.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("boardFlow.phases.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t("boardFlow.phases.empty")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const max = Math.max(...phases.map((p) => p.medianHours ?? 0), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("boardFlow.phases.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("boardFlow.phases.subtitle")}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {phases.map((phase) => {
          const width = ((phase.medianHours ?? 0) / max) * 100;
          return (
            <div key={phase.status} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-mono">{phase.status}</span>
                <span className="flex-shrink-0 tabular-nums">
                  {formatDuration(phase.medianHours)}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t("boardFlow.leadTime.sample", { count: phase.n })}
                    {phase.reentered > 0 &&
                      ` · ${t("boardFlow.phases.reentered", { count: phase.reentered })}`}
                  </span>
                </span>
              </div>
              {/* 4px rounded data-end, anchored to the baseline. */}
              <div className="h-2 w-full overflow-hidden rounded-sm bg-muted">
                <div
                  className={cn(
                    "h-full rounded-sm",
                    phase.bucket ? BUCKET_BG[phase.bucket] : "bg-signal-gray",
                  )}
                  style={{ width: `${Math.max(width, 1)}%` }}
                />
              </div>
            </div>
          );
        })}
        <BucketLegend buckets={phases.map((p) => p.bucket)} />
      </CardContent>
    </Card>
  );
}

function BucketLegend({ buckets }: { buckets: Array<LifecycleBucket | null> }) {
  const present = BUCKET_ORDER.filter((b) => buckets.includes(b));
  if (present.length < 2) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2">
      {present.map((bucket) => (
        <span
          key={bucket}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span
            className={cn("size-2 rounded-full", BUCKET_BG[bucket])}
            aria-hidden
          />
          {bucket}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WIP aging
// ---------------------------------------------------------------------------

export function AgingTable({ aging }: { aging: AgingColumn[] }) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("boardFlow.aging.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("boardFlow.aging.subtitle")}
        </p>
      </CardHeader>
      <CardContent>
        {aging.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("boardFlow.aging.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">
                    {t("boardFlow.stalled.column")}
                  </th>
                  <th className="py-2 pr-4 text-right font-medium">
                    {t("boardFlow.aging.count")}
                  </th>
                  <th className="py-2 pr-4 text-right font-medium">
                    {t("boardFlow.aging.median")}
                  </th>
                  <th className="py-2 text-right font-medium">
                    {t("boardFlow.aging.max")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {aging.map((col) => (
                  <tr key={col.status} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono">{col.status}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {col.count}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatDuration(col.medianAgeHours)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatDuration(col.maxAgeHours)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Throughput and flow balance
//
// Inflow and outflow share a unit, so they share one scale. The cumulative
// delta is a different measure entirely and gets its own column rather than a
// second y-axis.
// ---------------------------------------------------------------------------

export function ThroughputTable({ balance }: { balance: FlowBalance[] }) {
  const { t } = useTranslation();
  const recent = balance.slice(-12);
  const max = Math.max(...recent.flatMap((w) => [w.inflow, w.outflow]), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("boardFlow.throughput.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("boardFlow.throughput.subtitle")}
        </p>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("boardFlow.throughput.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">ISO</th>
                  <th className="py-2 pr-4 font-medium">
                    {t("boardFlow.throughput.inflow")}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {t("boardFlow.throughput.outflow")}
                  </th>
                  <th className="py-2 text-right font-medium">
                    {t("boardFlow.throughput.cumulative")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {recent.map((week) => (
                  <tr key={week.week} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-xs">{week.week}</td>
                    <td className="py-2 pr-4">
                      <MiniBar
                        value={week.inflow}
                        max={max}
                        className="bg-[var(--color-cat-6)]"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <MiniBar
                        value={week.outflow}
                        max={max}
                        className="bg-[var(--color-cat-1)]"
                      />
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {week.cumulativeDelta > 0 ? "+" : ""}
                      {week.cumulativeDelta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Bar with the number beside it — the value is never colour-only. */
function MiniBar({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-2 w-24 overflow-hidden rounded-sm bg-muted">
        <span
          className={cn("block h-full rounded-sm", className)}
          style={{ width: `${(value / max) * 100}%` }}
        />
      </span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cumulative flow diagram
// ---------------------------------------------------------------------------

interface CfdRow {
  week: string;
  backlog: number;
  discovery: number;
  queue: number;
  active: number;
  done: number;
}

/**
 * Stacked area by lifecycle bucket rather than by column.
 *
 * A real board carries a dozen-plus columns; stacking that many bands is
 * unreadable, while five buckets make accumulation obvious at a glance.
 */
export function CfdChart({
  cfd,
  statusBuckets,
}: {
  cfd: CfdPoint[];
  statusBuckets: Record<string, LifecycleBucket>;
}) {
  const { t } = useTranslation();

  if (cfd.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("boardFlow.cfd.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t("boardFlow.cfd.empty")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const rows: CfdRow[] = cfd.map((point) => {
    const row: CfdRow = {
      week: point.week,
      backlog: 0,
      discovery: 0,
      queue: 0,
      active: 0,
      done: 0,
    };
    for (const [status, count] of Object.entries(point.counts)) {
      const bucket = statusBuckets[status];
      if (bucket) row[bucket] += count;
    }
    return row;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("boardFlow.cfd.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("boardFlow.cfd.subtitle")}
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart
            data={rows}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--color-chart-grid)"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "0.5rem",
                fontSize: "0.75rem",
                color: "var(--color-foreground)",
              }}
              labelStyle={{ color: "var(--color-foreground)" }}
              itemStyle={{ color: "var(--color-muted-foreground)" }}
            />
            <Legend
              wrapperStyle={{
                fontSize: "0.75rem",
                color: "var(--color-muted-foreground)",
              }}
            />
            {BUCKET_ORDER.map((bucket) => (
              <Area
                key={bucket}
                type="monotone"
                dataKey={bucket}
                stackId="1"
                stroke={BUCKET_COLOR[bucket]}
                fill={BUCKET_COLOR[bucket]}
                fillOpacity={0.75}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Stalled items — the most actionable output on the page
// ---------------------------------------------------------------------------

export function StalledTable({ stalled }: { stalled: StalledItem[] }) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("boardFlow.stalled.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("boardFlow.stalled.subtitle")}
        </p>
      </CardHeader>
      <CardContent>
        {stalled.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("boardFlow.stalled.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">
                    {t("boardFlow.stalled.sinceMove")}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {t("boardFlow.stalled.column")}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {t("boardFlow.stalled.totalAge")}
                  </th>
                  <th className="py-2 font-medium">
                    {t("boardFlow.stalled.item")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {stalled.slice(0, 25).map((item) => (
                  <tr key={item.itemId} className="border-b border-border/50">
                    <td className="py-2 pr-4 tabular-nums text-signal-red">
                      {formatDuration(item.hoursSinceLastMove)}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {item.currentStatus ?? "—"}
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                      {formatDuration(item.totalAgeHours)}
                    </td>
                    <td className="max-w-md truncate py-2">{item.title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Little's Law + coverage
// ---------------------------------------------------------------------------

export function LittlesLawCard({ summary }: { summary: BoardFlowSummary }) {
  const { t } = useTranslation();
  const ll = summary.littlesLaw;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("boardFlow.littlesLaw.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("boardFlow.littlesLaw.subtitle")}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: t("boardFlow.littlesLaw.wip"), value: String(ll.wip) },
          {
            label: t("boardFlow.littlesLaw.throughput"),
            value:
              ll.throughputPerWeek === null
                ? "—"
                : String(ll.throughputPerWeek),
          },
          {
            label: t("boardFlow.littlesLaw.predicted"),
            value: formatDuration(ll.predictedLeadTimeHours),
          },
          {
            label: t("boardFlow.littlesLaw.observed"),
            value: formatDuration(ll.observedLeadTimeHours),
          },
          {
            label: t("boardFlow.littlesLaw.divergence"),
            value: ll.divergenceRatio === null ? "—" : `${ll.divergenceRatio}x`,
          },
        ].map((cell) => (
          <div key={cell.label}>
            <p className="text-xs uppercase text-muted-foreground">
              {cell.label}
            </p>
            <p className="font-mono text-xl font-medium">{cell.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function CoverageNote({ summary }: { summary: BoardFlowSummary }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <p>
        {t("boardFlow.coverage.withHistory", {
          count: summary.coverage.itemsWithHistory,
          total: summary.coverage.totalItems,
        })}
      </p>
      {summary.unmappedStatuses.length > 0 && (
        <p className="text-signal-yellow">
          {t("boardFlow.coverage.unmapped", {
            list: summary.unmappedStatuses.join(", "),
          })}
        </p>
      )}
    </div>
  );
}
