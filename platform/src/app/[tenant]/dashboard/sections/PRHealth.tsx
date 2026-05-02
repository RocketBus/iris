'use client';

import { MetricCard } from '@/components/charts/MetricCard';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useTranslation } from '@/hooks/useTranslation';
import type { PRHealthData } from '@/types/org-summary';

interface PRHealthProps {
  data: PRHealthData;
}

export function PRHealth({ data }: PRHealthProps) {
  const { t } = useTranslation();
  const hasOriginData = data.byOrigin.human || data.byOrigin.ai;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">{t('dashboard.prHealth.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('dashboard.prHealth.subtitle', { count: data.reposWithData })}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t('dashboard.prHealth.prsMerged')}
          value={data.totalPRsMerged.toLocaleString()}
          deltaFormat="abs"
        />
        <MetricCard
          label={t('dashboard.prHealth.timeToMerge')}
          value={
            data.medianTimeToMergeHours !== null
              ? `${data.medianTimeToMergeHours.toFixed(0)}h`
              : '\u2014'
          }
          invertDelta
        />
        <MetricCard
          label={t('dashboard.prHealth.singlePassRate')}
          value={
            data.singlePassRate !== null
              ? `${(data.singlePassRate * 100).toFixed(0)}%`
              : '\u2014'
          }
        />
        <MetricCard
          label={t('dashboard.prHealth.reviewRounds')}
          value={
            data.medianReviewRounds !== null
              ? data.medianReviewRounds.toFixed(1)
              : '\u2014'
          }
          invertDelta
        />
      </div>

      {/* AI vs Human PR acceptance */}
      {hasOriginData && (
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.prHealth.byOriginTitle')}</CardTitle>
            <CardDescription>
              {t('dashboard.prHealth.byOriginSubtitle')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4">{t('dashboard.prHealth.origin')}</th>
                    <th className="pb-2 pr-4">{t('dashboard.prHealth.singlePassRate')}</th>
                    <th className="pb-2">{t('dashboard.prHealth.reviewRounds')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byOrigin.human && (
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4">{t('dashboard.prHealth.human')}</td>
                      <td className="py-2 pr-4 font-mono">
                        {data.byOrigin.human.singlePassRate !== null
                          ? `${(data.byOrigin.human.singlePassRate * 100).toFixed(0)}%`
                          : '\u2014'}
                      </td>
                      <td className="py-2 font-mono">
                        {data.byOrigin.human.medianReviewRounds !== null
                          ? data.byOrigin.human.medianReviewRounds.toFixed(1)
                          : '\u2014'}
                      </td>
                    </tr>
                  )}
                  {data.byOrigin.ai && (
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 text-primary">{t('dashboard.prHealth.ai')}</td>
                      <td className="py-2 pr-4 font-mono text-primary">
                        {data.byOrigin.ai.singlePassRate !== null
                          ? `${(data.byOrigin.ai.singlePassRate * 100).toFixed(0)}%`
                          : '\u2014'}
                      </td>
                      <td className="py-2 font-mono text-primary">
                        {data.byOrigin.ai.medianReviewRounds !== null
                          ? data.byOrigin.ai.medianReviewRounds.toFixed(1)
                          : '\u2014'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
