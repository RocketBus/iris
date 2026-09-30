"use client";

import Link from "next/link";

import {
  AgingTable,
  CfdChart,
  CoverageNote,
  DurationSummary,
  LittlesLawCard,
  PhaseBars,
  QualityGates,
  StalledTable,
  ThroughputTable,
} from "./flow-sections";

import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { BoardFlowSummary, QualityReport } from "@/types/board-flow";

interface FlowViewProps {
  orgSlug: string;
  boards: Array<{ id: string; title: string }>;
  selectedBoardId: string;
  lastSyncedAt: string | null;
  summary: BoardFlowSummary;
  quality: QualityReport;
}

/**
 * Section order is deliberate: quality gates come before any number, so the
 * reader knows what the figures can carry before reading them.
 */
export function FlowView({
  orgSlug,
  boards,
  selectedBoardId,
  lastSyncedAt,
  summary,
  quality,
}: FlowViewProps) {
  const { t } = useTranslation();
  const isEmpty = summary.coverage.totalItems === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("boardFlow.title")}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {t("boardFlow.subtitle")}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("boardFlow.lastSynced")}:{" "}
          <span className="font-mono">
            {lastSyncedAt
              ? new Date(lastSyncedAt)
                  .toISOString()
                  .slice(0, 16)
                  .replace("T", " ")
              : t("boardFlow.neverSynced")}
          </span>
        </p>
      </div>

      {boards.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist">
          {boards.map((board) => {
            const isActive = board.id === selectedBoardId;
            return (
              <Link
                key={board.id}
                href={`/${orgSlug}/flow?board=${board.id}`}
                role="tab"
                aria-selected={isActive}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border text-muted-foreground hover:bg-muted/50",
                )}
              >
                {board.title}
              </Link>
            );
          })}
        </div>
      )}

      {isEmpty ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {t("boardFlow.empty")}
        </div>
      ) : (
        <>
          <QualityGates report={quality} />
          <DurationSummary summary={summary} />
          <PhaseBars phases={summary.phases} />
          <AgingTable aging={summary.aging} />
          <ThroughputTable balance={summary.balance} />
          <CfdChart cfd={summary.cfd} statusBuckets={summary.statusBuckets} />
          <StalledTable stalled={summary.stalled} />
          <LittlesLawCard summary={summary} />
          <CoverageNote summary={summary} />
        </>
      )}
    </div>
  );
}
