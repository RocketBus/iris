'use client';

import { HeroMetricCard } from '@/components/charts/HeroMetricCard';
import { useTranslation } from '@/hooks/useTranslation';
import type { OrgPulse as OrgPulseData } from '@/types/org-summary';

interface OrgPulseProps {
  data: OrgPulseData;
}

export function OrgPulse({ data }: OrgPulseProps) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <HeroMetricCard
        label={t('dashboard.pulse.totalCommits')}
        value={data.totalCommits.toLocaleString()}
        delta={data.totalCommitsDelta}
        deltaFormat="abs"
      />
      <HeroMetricCard
        label={t('dashboard.pulse.prsMerged')}
        value={data.prsMerged.toLocaleString()}
        delta={data.prsMergedDelta}
        deltaFormat="abs"
      />
      <HeroMetricCard
        label={t('dashboard.pulse.activeRepos')}
        value={data.activeRepos.toString()}
      />
      <HeroMetricCard
        label={t('dashboard.pulse.contributors')}
        value={data.activeContributors.toString()}
      />
      <HeroMetricCard
        label={t('dashboard.pulse.avgStabilization')}
        value={
          data.avgStabilization !== null
            ? `${(data.avgStabilization * 100).toFixed(0)}%`
            : '\u2014'
        }
        delta={data.avgStabilizationDelta}
        sparkline={data.sparklines.stabilization}
      />
      {data.aiAdoptionPct !== null && (
        <HeroMetricCard
          label={t('dashboard.pulse.aiAdoption')}
          value={`${data.aiAdoptionPct.toFixed(1)}%`}
          delta={data.aiAdoptionDelta}
        />
      )}
    </div>
  );
}
