"use client";

import { AlertOctagon, Bug, FolderOpen, Link2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type {
  HotspotSeverity,
  InvestmentHotspot,
  InvestmentHotspots as InvestmentHotspotsData,
} from "@/types/invest-here";

interface InvestmentHotspotsProps {
  data: InvestmentHotspotsData;
}

const severityColor: Record<HotspotSeverity, string> = {
  high: "bg-signal-red/10 text-signal-red border-signal-red/30",
  medium: "bg-signal-yellow/10 text-signal-yellow border-signal-yellow/30",
  low: "bg-muted text-muted-foreground border-border",
};

function SeverityBadge({ severity }: { severity: HotspotSeverity }) {
  const { t } = useTranslation();
  const label =
    severity === "high"
      ? t("investHere.severityHigh")
      : severity === "medium"
        ? t("investHere.severityMedium")
        : t("investHere.severityLow");

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        severityColor[severity],
      )}
    >
      {label}
    </span>
  );
}

function HotspotRow({ hotspot }: { hotspot: InvestmentHotspot }) {
  const { t } = useTranslation();

  if (hotspot.kind === "weak_directory") {
    return (
      <div className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0">
        <FolderOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-3">
            <p className="truncate font-mono text-sm font-medium">
              {t("investHere.weakDirectoryTitle", {
                directory: hotspot.directory,
              })}
            </p>
            <SeverityBadge severity={hotspot.severity} />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("investHere.weakDirectoryReason", {
              ratio: (hotspot.stabilizationRatio * 100).toFixed(0),
              files: hotspot.filesTouched,
              churn: hotspot.churnEvents,
            })}
          </p>
        </div>
      </div>
    );
  }

  if (hotspot.kind === "tight_coupling") {
    // The engine's own floor for even surfacing a coupling hotspot is 3
    // joint changes (COUPLING_MIN_OCCURRENCES in invest-here.ts) — right at
    // that floor, "90% coupled" is 3-for-3, not a real trend. Below this
    // (still low but arbitrary) bar, say so instead of badging it exactly
    // like a hotspot backed by dozens of occurrences.
    const isLowSample = hotspot.coOccurrences < 5;

    return (
      <div className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0">
        <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-3">
            <p className="font-mono text-sm font-medium">
              {t("investHere.tightCouplingTitle")}
            </p>
            <SeverityBadge severity={hotspot.severity} />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("investHere.tightCouplingReason", {
              fileA: hotspot.fileA,
              fileB: hotspot.fileB,
              rate: (hotspot.couplingRate * 100).toFixed(0),
              count: hotspot.coOccurrences,
            })}
          </p>
          {isLowSample && (
            <p className="text-xs text-signal-yellow">
              {t("investHere.tightCouplingLowSample", {
                count: hotspot.coOccurrences,
              })}
            </p>
          )}
        </div>
      </div>
    );
  }

  // fix_magnet — translate the raw origin enum, matching charts.tsx's
  // originLabels convention, instead of interpolating "AI_ASSISTED" as-is.
  const originLabel =
    hotspot.origin === "HUMAN"
      ? t("repoCharts.origin.labels.human")
      : hotspot.origin === "AI_ASSISTED"
        ? t("repoCharts.origin.labels.ai")
        : t("repoCharts.origin.labels.bot");

  return (
    <div className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0">
      <Bug className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium">
            {t("investHere.fixMagnetTitle", { origin: originLabel })}
          </p>
          <SeverityBadge severity={hotspot.severity} />
        </div>
        <p className="text-xs text-muted-foreground">
          {t("investHere.fixMagnetReason", {
            origin: originLabel,
            codeShare: hotspot.codeSharePct.toFixed(0),
            fixShare: hotspot.fixSharePct.toFixed(0),
            disp: hotspot.disproportionality.toFixed(1),
            count: hotspot.fixesAttracted,
          })}
        </p>
      </div>
    </div>
  );
}

export function InvestmentHotspots({ data }: InvestmentHotspotsProps) {
  const { t } = useTranslation();

  if (data.hotspots.length === 0) {
    // Distinguish "nothing was even evaluated" from "evaluated and
    // healthy" — both used to render the same reassuring message, which
    // reads as a false-positive "all good" for a repo with no signal at
    // all (e.g. no stability_map/churn_couplings/fix_target_by_origin in
    // the payload yet).
    const { directories, couplings, origins } = data.sourceCounts;
    const hasNoData = directories + couplings + origins === 0;

    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("investHere.title")}</CardTitle>
          <CardDescription>{t("investHere.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "flex items-center gap-3 rounded-md border p-4 text-sm text-muted-foreground",
              hasNoData
                ? "border-border bg-muted/30"
                : "border-signal-purple/30 bg-signal-purple/5",
            )}
          >
            <AlertOctagon
              className={cn(
                "size-4 shrink-0",
                hasNoData ? "text-muted-foreground" : "text-signal-purple",
              )}
            />
            <span>
              {hasNoData ? t("investHere.noData") : t("investHere.empty")}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("investHere.title")}</CardTitle>
        <CardDescription>{t("investHere.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div>
          {data.hotspots.map((h, idx) => (
            <HotspotRow key={`${h.kind}-${idx}`} hotspot={h} />
          ))}
        </div>
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {t("investHere.hypothesisNote")}
        </p>
      </CardContent>
    </Card>
  );
}
