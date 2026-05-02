'use client';

import { ArrowDown, ArrowRight, ArrowUp, Sparkles } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTranslation } from '@/hooks/useTranslation';
import type {
  AdoptionDelta,
  AdoptionSummary,
} from '@/lib/queries/adoption-timeline';
import { cn } from '@/lib/utils';

interface AdoptionTimelineCardProps {
  summary: AdoptionSummary | null;
  /** When true, render a compact variant meant for repo detail page. */
  compact?: boolean;
  /** Title shown above the card; falls back to the default adoption title. */
  title?: string;
}

function fmtPct(value: number | null, decimals = 0): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(decimals)}%`;
}

function fmtDelta(deltaPp: number | null): string {
  if (deltaPp == null || Number.isNaN(deltaPp)) return '—';
  const sign = deltaPp > 0 ? '+' : '';
  return `${sign}${deltaPp.toFixed(1)}pp`;
}

function DeltaRow({ delta }: { delta: AdoptionDelta }) {
  const { t } = useTranslation();
  const label = t(`adoption.metrics.${delta.key}`);

  const colorClass =
    delta.direction === 'up'
      ? 'text-signal-purple'
      : delta.direction === 'down'
        ? 'text-signal-red'
        : 'text-muted-foreground';

  const Icon =
    delta.direction === 'up'
      ? ArrowUp
      : delta.direction === 'down'
        ? ArrowDown
        : ArrowRight;

  const decimals = delta.key === 'revert' ? 1 : 0;

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-2 text-sm font-medium">{label}</td>
      <td className="px-4 py-2 text-right tabular-nums text-sm">
        {fmtPct(delta.pre, decimals)}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-sm">
        {fmtPct(delta.post, decimals)}
      </td>
      <td className={cn('px-4 py-2 text-right tabular-nums text-sm', colorClass)}>
        <span className="inline-flex items-center justify-end gap-1">
          <Icon className="size-3" />
          {fmtDelta(delta.deltaPp)}
        </span>
      </td>
    </tr>
  );
}

function ConfidenceBadge({ confidence }: { confidence: AdoptionSummary['confidence'] }) {
  const { t } = useTranslation();
  const label = t(`adoption.confidence.${confidence}`);

  const classes =
    confidence === 'clear'
      ? 'bg-signal-purple/10 text-signal-purple border-signal-purple/30'
      : 'bg-signal-yellow/10 text-signal-yellow border-signal-yellow/30';

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        classes,
      )}
    >
      {label}
    </span>
  );
}

export function AdoptionTimelineCard({
  summary,
  compact,
  title,
}: AdoptionTimelineCardProps) {
  const { t } = useTranslation();

  const headerTitle = title ?? t('adoption.title');

  if (!summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{headerTitle}</CardTitle>
          <CardDescription>{t('adoption.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('adoption.empty')}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (summary.confidence === 'insufficient') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{headerTitle}</CardTitle>
          <CardDescription>{t('adoption.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('adoption.insufficient', { count: summary.totalAiCommits })}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              {headerTitle}
            </CardTitle>
            <CardDescription>
              {t('adoption.detected', {
                date: summary.inflection,
                count: summary.totalAiCommits,
              })}
            </CardDescription>
          </div>
          <ConfidenceBadge confidence={summary.confidence} />
        </div>
      </CardHeader>
      <CardContent className={cn('p-0', compact && 'text-sm')}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">
                  {t('adoption.columns.metric')}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t('adoption.columns.pre')}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t('adoption.columns.post')}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t('adoption.columns.delta')}
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.deltas.map((d) => (
                <DeltaRow key={d.key} delta={d} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {t('adoption.hypothesisNote')}
        </p>
      </CardContent>
    </Card>
  );
}
