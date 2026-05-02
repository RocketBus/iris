'use client';

import { GitHubAvatar } from '@/app/[tenant]/repos/[repoName]/github-avatar';
import { useTranslation } from '@/hooks/useTranslation';
import type { HyperEngineer } from '@/types/org-summary';

interface HyperEngineersProps {
  engineers: HyperEngineer[];
}

export function HyperEngineers({ engineers }: HyperEngineersProps) {
  const { t } = useTranslation();
  if (engineers.length === 0) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">{t('dashboard.hyperEngineers.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('dashboard.hyperEngineers.subtitle')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {engineers.map((eng) => (
          <div
            key={eng.name}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
          >
            {eng.github ? (
              <GitHubAvatar username={eng.github} name={eng.name} />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {eng.name.charAt(0).toUpperCase()}
              </div>
            )}
            {eng.github ? (
              <a
                href={`https://github.com/${eng.github}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm hover:text-primary transition-colors"
              >
                {eng.name}
              </a>
            ) : (
              <span className="text-sm">{eng.name}</span>
            )}
            <span title={t('dashboard.hyperEngineers.badge')}>&#x1F3C6;</span>
            {eng.repos > 1 && (
              <span className="text-xs text-muted-foreground">
                {t('dashboard.hyperEngineers.repos', { count: eng.repos })}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
