"use client";

import { Activity } from "lucide-react";

import { MetricCard } from "@/components/charts/MetricCard";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import type { OrgDORA } from "@/types/org-summary";

/**
 * Threshold for showing the AI-vs-human correlation cards. Lower
 * numbers risk attributing noise to "AI is worse" before there's
 * enough signal. Set to 10 failed deploys (per the post-probe
 * revision in docs/PLAN-datadog.md §9.6) — that's roughly 5–6 weeks
 * of data on a mid-traffic tenant.
 */
const MIN_FAILED_FOR_CORRELATION = 10;

interface Props {
  data: OrgDORA;
}

export function DORAOverview({ data }: Props) {
  const { t } = useTranslation();
  if (data.reposWithData === 0) return null;

  const showCorrelation =
    data.deploymentsFailed >= MIN_FAILED_FOR_CORRELATION &&
    data.cfrByOrigin.length >= 2;

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-medium">
            {t("dashboard.dora.title")}
            <Badge variant="outline" className="border-primary/40 text-primary">
              <Activity className="mr-1 size-3" />
              {t("dashboard.dora.sourceBadge")}
            </Badge>
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("dashboard.dora.subtitle", { count: data.reposWithData })}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t("dashboard.dora.metrics.cfr")}
          value={formatCFR(data.cfr)}
        />
        <MetricCard
          label={t("dashboard.dora.metrics.mttrPerDeploy")}
          value={formatHours(data.mttrPerDeploySecondsMedian)}
        />
        <MetricCard
          label={t("dashboard.dora.metrics.deployFrequency")}
          value={formatFrequency(data.deployFrequencyPerDay)}
        />
        <MetricCard
          label={t("dashboard.dora.metrics.leadTime")}
          value={formatHours(data.leadTimeSecondsMedian)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <DORAFactCard
          label={t("dashboard.dora.metrics.deploymentsTotal")}
          value={String(data.deploymentsTotal)}
          hint={t("dashboard.dora.metrics.deploymentsTotalHint", {
            failed: data.deploymentsFailed,
          })}
        />
        <DORAFactCard
          label={t("dashboard.dora.metrics.rollbackRate")}
          value={formatRate(data.rollbackRate)}
          hint={t("dashboard.dora.metrics.rollbackRateHint", {
            count: data.rollbacksTotal,
          })}
        />
        <DORAFactCard
          label={t("dashboard.dora.metrics.pending")}
          value={String(data.deploymentsPendingEvaluation)}
          hint={t("dashboard.dora.metrics.pendingHint")}
        />
      </div>

      {showCorrelation ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.dora.correlation.title")}</CardTitle>
            <CardDescription>
              {t("dashboard.dora.correlation.subtitle", {
                threshold: MIN_FAILED_FOR_CORRELATION,
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <CorrelationTable
              rows={data.cfrByOrigin.map((r) => ({
                origin: r.origin,
                rate: r.cfr,
                rateLabel: formatRate(r.cfr),
                numeratorLabel: t("dashboard.dora.correlation.cfrDenominator", {
                  failed: r.failed,
                  evaluated: r.evaluated,
                }),
              }))}
              headerLabel={t("dashboard.dora.correlation.cfrHeader")}
            />

            {data.rollbackRateByOrigin.length >= 2 && (
              <CorrelationTable
                rows={data.rollbackRateByOrigin.map((r) => ({
                  origin: r.origin,
                  rate: r.rollbackRate,
                  rateLabel: formatRate(r.rollbackRate),
                  numeratorLabel: t(
                    "dashboard.dora.correlation.rollbackDenominator",
                    { rollbacks: r.rollbacks, failed: r.failed },
                  ),
                }))}
                headerLabel={t("dashboard.dora.correlation.rollbackHeader")}
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
              {t("dashboard.dora.correlation.insufficient", {
                threshold: MIN_FAILED_FOR_CORRELATION,
                actual: data.deploymentsFailed,
              })}
            </p>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function DORAFactCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function CorrelationTable({
  rows,
  headerLabel,
}: {
  rows: Array<{
    origin: "HUMAN" | "AI_ASSISTED" | "BOT";
    rate: number;
    rateLabel: string;
    numeratorLabel: string;
  }>;
  headerLabel: string;
}) {
  const { t } = useTranslation();
  const maxRate = Math.max(...rows.map((r) => r.rate), 0.001);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{headerLabel}</p>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.origin} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">
                {t(`dashboard.dora.correlation.origin.${row.origin}`)}
              </span>
              <span className="text-muted-foreground">
                <span className="font-mono text-foreground">
                  {row.rateLabel}
                </span>{" "}
                <span className="text-xs">{row.numeratorLabel}</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${(row.rate / maxRate) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatCFR(cfr: number | null): string {
  if (cfr === null) return "—";
  return `${(cfr * 100).toFixed(1)}%`;
}

function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${(rate * 100).toFixed(0)}%`;
}

function formatHours(seconds: number | null): string {
  if (seconds === null) return "—";
  const hours = seconds / 3600;
  if (hours < 1) return `${(seconds / 60).toFixed(0)} min`;
  if (hours < 24) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

function formatFrequency(perDay: number | null): string {
  if (perDay === null) return "—";
  if (perDay >= 1) return `${perDay.toFixed(1)} / day`;
  const perWeek = perDay * 7;
  if (perWeek >= 1) return `${perWeek.toFixed(1)} / week`;
  return `${(perDay * 30).toFixed(1)} / month`;
}
