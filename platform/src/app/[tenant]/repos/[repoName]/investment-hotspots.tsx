'use client';

import { AlertOctagon, Bug, FolderOpen, Link2 } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';
import type {
  HotspotSeverity,
  InvestmentHotspot,
  InvestmentHotspots as InvestmentHotspotsData,
} from '@/types/invest-here';

interface InvestmentHotspotsProps {
  data: InvestmentHotspotsData;
}

const severityColor: Record<HotspotSeverity, string> = {
  high: 'bg-signal-red/10 text-signal-red border-signal-red/30',
  medium: 'bg-signal-yellow/10 text-signal-yellow border-signal-yellow/30',
  low: 'bg-muted text-muted-foreground border-border',
};

function SeverityBadge({ severity }: { severity: HotspotSeverity }) {
  const { t } = useTranslation();
  const label =
    severity === 'high'
      ? t('investHere.severityHigh')
      : severity === 'medium'
        ? t('investHere.severityMedium')
        : t('investHere.severityLow');

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        severityColor[severity],
      )}
    >
      {label}
    </span>
  );
}

function HotspotRow({ hotspot }: { hotspot: InvestmentHotspot }) {
  const { t } = useTranslation();

  if (hotspot.kind === 'weak_directory') {
    return (
      <div className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0">
        <FolderOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-3">
            <p className="truncate font-mono text-sm font-medium">
              {t('investHere.weakDirectoryTitle', { directory: hotspot.directory })}
            </p>
            <SeverityBadge severity={hotspot.severity} />
          </div>
          <p className="text-xs text-muted-foreground">
            {t('investHere.weakDirectoryReason', {
              ratio: (hotspot.stabilizationRatio * 100).toFixed(0),
              files: hotspot.filesTouched,
              churn: hotspot.churnEvents,
            })}
          </p>
        </div>
      </div>
    );
  }

  if (hotspot.kind === 'tight_coupling') {
    return (
      <div className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0">
        <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-3">
            <p className="font-mono text-sm font-medium">
              {t('investHere.tightCouplingTitle')}
            </p>
            <SeverityBadge severity={hotspot.severity} />
          </div>
          <p className="text-xs text-muted-foreground">
            {t('investHere.tightCouplingReason', {
              fileA: hotspot.fileA,
              fileB: hotspot.fileB,
              rate: (hotspot.couplingRate * 100).toFixed(0),
              count: hotspot.coOccurrences,
            })}
          </p>
        </div>
      </div>
    );
  }

  // fix_magnet
  return (
    <div className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0">
      <Bug className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium">
            {t('investHere.fixMagnetTitle', { origin: hotspot.origin })}
          </p>
          <SeverityBadge severity={hotspot.severity} />
        </div>
        <p className="text-xs text-muted-foreground">
          {t('investHere.fixMagnetReason', {
            origin: hotspot.origin,
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
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('investHere.title')}</CardTitle>
          <CardDescription>{t('investHere.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 rounded-md border border-signal-purple/30 bg-signal-purple/5 p-4 text-sm text-muted-foreground">
            <AlertOctagon className="size-4 shrink-0 text-signal-purple" />
            <span>{t('investHere.empty')}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('investHere.title')}</CardTitle>
        <CardDescription>{t('investHere.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div>
          {data.hotspots.map((h, idx) => (
            <HotspotRow key={`${h.kind}-${idx}`} hotspot={h} />
          ))}
        </div>
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {t('investHere.hypothesisNote')}
        </p>
      </CardContent>
    </Card>
  );
}
