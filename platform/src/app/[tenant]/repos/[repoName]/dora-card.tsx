"use client";

import { Activity } from "lucide-react";

import { MetricCard } from "@/components/charts/MetricCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import type { RepoDORA } from "@/types/org-summary";

interface Props {
  data: RepoDORA;
}

export function DORARepoCard({ data }: Props) {
  const { t } = useTranslation();

  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-medium">
          {t("repos.detail.dora.title")}
          <Badge variant="outline" className="border-primary/40 text-primary">
            <Activity className="mr-1 size-3" />
            {t("dashboard.dora.sourceBadge")}
          </Badge>
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("repos.detail.dora.subtitle", { days: data.windowDays })}
        </p>
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

      <div className="grid gap-3 md:grid-cols-3">
        <RepoFactCard
          label={t("dashboard.dora.metrics.deploymentsTotal")}
          value={String(data.deploymentsTotal)}
          hint={t("dashboard.dora.metrics.deploymentsTotalHint", {
            failed: data.deploymentsFailed,
          })}
        />
        <RepoFactCard
          label={t("dashboard.dora.metrics.rollbackRate")}
          value={formatRate(data.rollbackRate)}
          hint={t("dashboard.dora.metrics.rollbackRateHint", {
            count: data.rollbacksTotal,
          })}
        />
        <RepoFactCard
          label={t("dashboard.dora.metrics.pending")}
          value={String(data.deploymentsPendingEvaluation)}
          hint={t("dashboard.dora.metrics.pendingHint")}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {t("repos.detail.dora.incidentDisclaimer")}
      </p>
    </section>
  );
}

function RepoFactCard({
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
