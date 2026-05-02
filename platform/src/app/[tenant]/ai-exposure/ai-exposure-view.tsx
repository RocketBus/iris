import Link from 'next/link';

import { AlertTriangle, Eye, TrendingUp } from 'lucide-react';

import { InstallHookDialog } from './install-hook-dialog';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getServerTranslation } from '@/lib/server-translation';
import { cn } from '@/lib/utils';
import type { ShadowAIExposure, ShadowAIExposureRepo } from '@/types/shadow-ai';

interface AIExposureViewProps {
  exposure: ShadowAIExposure;
  tenantSlug: string;
}

const GAP_COLOR_HIGH = 'text-signal-red';
const GAP_COLOR_MED = 'text-signal-yellow';
const GAP_COLOR_LOW = 'text-muted-foreground';

function gapTone(gap: number | null): string {
  if (gap === null) return GAP_COLOR_LOW;
  if (gap >= 15) return GAP_COLOR_HIGH;
  if (gap >= 5) return GAP_COLOR_MED;
  return GAP_COLOR_LOW;
}

function fmtPct(value: number | null, decimals = 0): string {
  if (value === null || Number.isNaN(value)) return '—';
  return `${value.toFixed(decimals)}%`;
}

function fmtGap(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(0)} pp`;
}

function repoShowsShadowSignal(row: ShadowAIExposureRepo): boolean {
  if (row.flaggedCommits <= 0) return false;
  if (row.gapPoints === null) return false;
  return row.gapPoints >= 5;
}

export async function AIExposureView({ exposure, tenantSlug }: AIExposureViewProps) {
  const { t } = await getServerTranslation();
  const { org, repos } = exposure;

  if (org.reposConsidered === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {t('aiExposure.empty')}
        </CardContent>
      </Card>
    );
  }

  const hasShadow = org.flaggedCommits > 0;

  return (
    <div className="space-y-6">
      {/* Org summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Eye className="size-4" />
              {t('aiExposure.summary.attributed')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{fmtPct(org.attributedCoveragePct)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('aiExposure.summary.attributedHint')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TrendingUp className="size-4" />
              {t('aiExposure.summary.estimated')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{fmtPct(org.estimatedExposurePct)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('aiExposure.summary.estimatedHint')}
            </p>
          </CardContent>
        </Card>

        <Card className={cn(hasShadow && 'border-signal-yellow/40')}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <AlertTriangle className="size-4" />
              {t('aiExposure.summary.gap')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn('text-3xl font-bold', gapTone(org.gapPoints))}>
              {fmtGap(org.gapPoints)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('aiExposure.summary.gapHint')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Baseline explanation */}
      <p className="text-sm text-muted-foreground">
        {hasShadow
          ? t('aiExposure.summary.baseline', {
              flagged: org.flaggedCommits,
              total: org.humanCommits,
            })
          : t('aiExposure.summary.noSignal')}
      </p>

      {/* Repo table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('aiExposure.table.title')}</CardTitle>
          <CardDescription>
            {org.reposConsidered} {org.reposConsidered === 1 ? 'repository' : 'repositories'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">{t('aiExposure.table.name')}</th>
                  <th className="px-4 py-2 text-right font-medium">
                    {t('aiExposure.table.attributed')}
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    {t('aiExposure.table.shadow')}
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    {t('aiExposure.table.gap')}
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    {t('aiExposure.table.action')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {repos.map((row) => {
                  const showInstall = repoShowsShadowSignal(row);
                  const attributedOnly =
                    row.flaggedCommits === 0 && (row.attributedCoveragePct ?? 0) > 0;

                  return (
                    <tr
                      key={row.repositoryId}
                      className="border-b border-border last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link
                          href={`/${tenantSlug}/repos/${encodeURIComponent(row.name)}`}
                          className="hover:underline"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtPct(row.attributedCoveragePct)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.flaggedCommits === 0 ? (
                          <span className="text-muted-foreground">
                            {t('aiExposure.table.noSignal')}
                          </span>
                        ) : (
                          fmtPct(row.shadowSignalPct)
                        )}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 text-right font-medium tabular-nums',
                          gapTone(row.gapPoints),
                        )}
                      >
                        {fmtGap(row.gapPoints)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {showInstall ? (
                          <InstallHookDialog repositoryName={row.name}>
                            <Button variant="outline" size="sm" className="h-8 text-xs">
                              {t('aiExposure.table.installHook')}
                            </Button>
                          </InstallHookDialog>
                        ) : attributedOnly ? (
                          <span className="text-xs text-muted-foreground">
                            {t('aiExposure.table.attributedOnly')}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{t('aiExposure.hypothesisNote')}</p>
    </div>
  );
}
