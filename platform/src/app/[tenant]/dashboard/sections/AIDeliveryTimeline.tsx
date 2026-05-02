'use client';

import Link from 'next/link';

import { ArrowDown, ArrowRight, ArrowUp, Sparkles } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTranslation } from '@/hooks/useTranslation';
import type { RepoAdoption } from '@/lib/queries/adoption-timeline';
import { cn } from '@/lib/utils';

interface AIDeliveryTimelineProps {
  rows: RepoAdoption[];
  orgSlug: string;
}

function fmtDelta(pp: number | null): string {
  if (pp == null || Number.isNaN(pp)) return '—';
  const sign = pp > 0 ? '+' : '';
  return `${sign}${pp.toFixed(1)}pp`;
}

export function AIDeliveryTimeline({ rows, orgSlug }: AIDeliveryTimelineProps) {
  const { t } = useTranslation();

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            {t('adoption.orgTitle')}
          </CardTitle>
          <CardDescription>{t('adoption.orgSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('adoption.orgEmpty')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          {t('adoption.orgTitle')}
        </CardTitle>
        <CardDescription>{t('adoption.orgSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">
                  {t('adoption.columns.repository')}
                </th>
                <th className="px-4 py-2 font-medium">
                  {t('adoption.columns.detected')}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t('adoption.columns.stabilizationDelta')}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t('adoption.columns.aiCommits')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const pp = row.headlineDeltaPp;
                const direction =
                  pp == null || Math.abs(pp) < 2
                    ? 'flat'
                    : pp > 0
                      ? 'up'
                      : 'down';
                const Icon =
                  direction === 'up'
                    ? ArrowUp
                    : direction === 'down'
                      ? ArrowDown
                      : ArrowRight;
                const colorClass =
                  direction === 'up'
                    ? 'text-signal-purple'
                    : direction === 'down'
                      ? 'text-signal-red'
                      : 'text-muted-foreground';

                return (
                  <tr
                    key={row.repoId}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/${orgSlug}/repos/${encodeURIComponent(row.repoName)}`}
                        className="font-mono hover:text-primary transition-colors"
                      >
                        {row.repoName}
                      </Link>
                      {row.confidence === 'sparse' && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          ({t('adoption.confidence.sparse')})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.inflection}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 text-right tabular-nums',
                        colorClass,
                      )}
                    >
                      <span className="inline-flex items-center justify-end gap-1">
                        <Icon className="size-3" />
                        {fmtDelta(pp)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.totalAiCommits}
                    </td>
                  </tr>
                );
              })}
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
