'use client';

import { Sparkline } from '@/components/charts/Sparkline';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';
import type { RepoSummary } from '@/types/temporal';
import { healthIndicator } from '@/types/temporal';

interface CompareViewProps {
  repos: RepoSummary[];
}

const healthColors: Record<string, string> = {
  green: 'text-signal-purple',
  yellow: 'text-signal-yellow',
  red: 'text-signal-red',
  gray: 'text-muted-foreground',
};

type MetricFormat = 'pct' | 'number' | 'rate';

function formatMetric(value: number, format: MetricFormat): string {
  switch (format) {
    case 'pct':
      return `${(value * 100).toFixed(0)}%`;
    case 'rate':
      return `${(value * 100).toFixed(1)}%`;
    case 'number':
      return value.toFixed(0);
  }
}

function metricClass(
  value: number | null,
  best: number | null | undefined,
  worst: number | null | undefined,
): string {
  if (value === null) return '';
  if (best !== null && best !== undefined && value === best) return 'text-signal-purple';
  if (worst !== null && worst !== undefined && value === worst) return 'text-signal-red';
  return '';
}

function MetricCell({
  value,
  format = 'pct',
  best,
  worst,
}: {
  value: number | null;
  format?: MetricFormat;
  invert?: boolean;
  best?: number | null;
  worst?: number | null;
}) {
  if (value === null) return <td className="px-3 py-2 text-muted-foreground">{'\u2014'}</td>;

  return (
    <td className={cn('px-3 py-2 font-mono text-sm', metricClass(value, best, worst))}>
      {formatMetric(value, format)}
    </td>
  );
}

function MetricStat({
  label,
  value,
  format = 'pct',
  best,
  worst,
}: {
  label: string;
  value: number | null;
  format?: MetricFormat;
  best?: number | null;
  worst?: number | null;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-sm', metricClass(value, best, worst))}>
        {value === null ? '\u2014' : formatMetric(value, format)}
      </span>
    </div>
  );
}

export function CompareView({ repos }: CompareViewProps) {
  const { t } = useTranslation();
  if (repos.length === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        {t('compare.empty')}
      </div>
    );
  }

  // Sort by stabilization (best first)
  const sorted = [...repos]
    .filter((r) => r.stabilization_ratio !== null)
    .sort((a, b) => (b.stabilization_ratio ?? 0) - (a.stabilization_ratio ?? 0));

  const allStab = sorted.map((r) => r.stabilization_ratio).filter((v): v is number => v !== null);
  const bestStab = allStab.length > 0 ? Math.max(...allStab) : null;
  const worstStab = allStab.length > 1 ? Math.min(...allStab) : null;

  const allChurn = sorted.map((r) => r.churn_events).filter((v): v is number => v !== null);
  const bestChurn = allChurn.length > 0 ? Math.min(...allChurn) : null;
  const worstChurn = allChurn.length > 1 ? Math.max(...allChurn) : null;

  const allRevert = sorted.map((r) => r.revert_rate).filter((v): v is number => v !== null);
  const bestRevert = allRevert.length > 0 ? Math.min(...allRevert) : null;
  const worstRevert = allRevert.length > 1 ? Math.max(...allRevert) : null;

  const allAI = sorted.map((r) => r.ai_detection_coverage_pct).filter((v): v is number => v !== null && v > 0);
  const hasAnyAI = allAI.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('compare.ranking')}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Desktop / tablet: table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-3">#</th>
                <th className="pb-2 pr-3">{t('compare.columns.repository')}</th>
                <th className="pb-2 px-3">{t('compare.columns.stabilization')}</th>
                <th className="pb-2 px-3">{t('compare.columns.revertRate')}</th>
                <th className="pb-2 px-3">{t('compare.columns.churn')}</th>
                <th className="pb-2 px-3">{t('compare.columns.commits')}</th>
                {hasAnyAI && <th className="pb-2 px-3">{t('compare.columns.ai')}</th>}
                <th className="pb-2 px-3">{t('compare.columns.trend')}</th>
                <th className="pb-2 px-3">{t('compare.columns.health')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((repo, i) => {
                const color = healthIndicator(repo.health);
                return (
                  <tr key={repo.id} className="border-b border-border/50">
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {i + 1}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-mono text-sm">{repo.name}</span>
                    </td>
                    <MetricCell
                      value={repo.stabilization_ratio}
                      format="pct"
                      best={bestStab}
                      worst={worstStab}
                    />
                    <MetricCell
                      value={repo.revert_rate}
                      format="rate"
                      invert
                      best={bestRevert}
                      worst={worstRevert}
                    />
                    <MetricCell
                      value={repo.churn_events}
                      format="number"
                      invert
                      best={bestChurn}
                      worst={worstChurn}
                    />
                    <MetricCell value={repo.commits_total} format="number" />
                    {hasAnyAI && (
                      <td className="px-3 py-2 font-mono text-sm text-primary">
                        {repo.ai_detection_coverage_pct != null && repo.ai_detection_coverage_pct > 0
                          ? `${repo.ai_detection_coverage_pct < 10 ? repo.ai_detection_coverage_pct.toFixed(1) : repo.ai_detection_coverage_pct.toFixed(0)}%`
                          : '\u2014'}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <Sparkline data={repo.sparkline} />
                    </td>
                    <td className={cn('px-3 py-2 text-sm font-medium', healthColors[color])}>
                      {repo.health}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile: card stack */}
        <ul className="flex flex-col gap-3 md:hidden">
          {sorted.map((repo, i) => {
            const color = healthIndicator(repo.health);
            return (
              <li
                key={repo.id}
                className="flex flex-col gap-3 rounded-lg border border-border/60 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="text-xs text-muted-foreground">#{i + 1}</span>
                    <span className="truncate font-mono text-sm">{repo.name}</span>
                  </div>
                  <span
                    className={cn(
                      'flex-shrink-0 text-xs font-medium capitalize',
                      healthColors[color],
                    )}
                  >
                    {repo.health}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <MetricStat
                    label={t('compare.columns.stabilization')}
                    value={repo.stabilization_ratio}
                    format="pct"
                    best={bestStab}
                    worst={worstStab}
                  />
                  <MetricStat
                    label={t('compare.mobile.revertRate')}
                    value={repo.revert_rate}
                    format="rate"
                    best={bestRevert}
                    worst={worstRevert}
                  />
                  <MetricStat
                    label={t('compare.columns.churn')}
                    value={repo.churn_events}
                    format="number"
                    best={bestChurn}
                    worst={worstChurn}
                  />
                  <MetricStat
                    label={t('compare.columns.commits')}
                    value={repo.commits_total}
                    format="number"
                  />
                  {hasAnyAI && (
                    <MetricStat
                      label={t('compare.columns.ai')}
                      value={repo.ai_detection_coverage_pct}
                      format="rate"
                    />
                  )}
                </div>

                <div className="border-t border-border/60 pt-2">
                  <span className="mb-1 block text-xs text-muted-foreground">{t('compare.mobile.trend')}</span>
                  <Sparkline data={repo.sparkline} />
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
