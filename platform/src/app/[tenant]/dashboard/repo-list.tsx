'use client';

import { useState } from 'react';

import Link from 'next/link';

import { ArrowUp, ArrowDown, Search, Trash2 } from 'lucide-react';

import { Sparkline } from '@/components/charts/Sparkline';
import { DeleteRepositoryDialog } from '@/components/repos/DeleteRepositoryDialog';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';
import type { RepoSummary } from '@/types/temporal';
import { healthIndicator } from '@/types/temporal';


interface RepoListProps {
  repos: RepoSummary[];
  orgSlug: string;
  organizationId?: string;
  canDelete?: boolean;
  showSearch?: boolean;
}

const healthColors: Record<string, string> = {
  green: 'bg-signal-purple',
  yellow: 'bg-signal-yellow',
  red: 'bg-signal-red',
  gray: 'bg-signal-gray',
};

export function RepoList({
  repos,
  orgSlug,
  organizationId,
  canDelete = false,
  showSearch = false,
}: RepoListProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const showDeleteColumn = canDelete && !!organizationId;

  if (repos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        <p>{t('dashboard.repoList.empty')}</p>
        <Button asChild size="sm">
          <Link href={`/${orgSlug}/connect`}>{t('connect.emptyStateLink')}</Link>
        </Button>
      </div>
    );
  }

  const filtered = query
    ? repos.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
    : repos;

  return (
    <div className="space-y-2">
      {showSearch && repos.length > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('dashboard.repoList.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}
      {filtered.map((repo) => {
        const color = healthIndicator(repo.health);
        const hasDelta =
          repo.stabilization_delta !== null && repo.stabilization_delta !== 0;
        const deltaUp = hasDelta && repo.stabilization_delta! > 0;

        return (
          <div
            key={repo.id}
            className="flex min-h-12 items-stretch rounded-md border border-border transition-colors"
          >
            <Link
              href={`/${orgSlug}/repos/${encodeURIComponent(repo.name)}`}
              className={cn(
                'flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md p-3 transition-colors',
                'hover:bg-muted/50 active:bg-muted/60',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                {/* Health dot */}
                <div
                  className={cn(
                    'size-2.5 flex-shrink-0 rounded-full',
                    healthColors[color]
                  )}
                />
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-medium">{repo.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {repo.runs_count} runs
                    {repo.last_run_at &&
                      ` · last ${new Date(repo.last_run_at).toISOString().slice(0, 10)}`}
                  </p>
                </div>
              </div>

              <div className="flex flex-shrink-0 items-center gap-3 sm:gap-4">
                {/* Sparkline — hidden on very narrow screens to prevent crowding */}
                <div className="hidden sm:block">
                  <Sparkline data={repo.sparkline} />
                </div>

                {/* AI adoption badge — fixed width to keep alignment */}
                <span className="hidden w-12 text-right text-xs text-primary sm:block">
                  {repo.ai_detection_coverage_pct != null && repo.ai_detection_coverage_pct > 0
                    ? `AI ${repo.ai_detection_coverage_pct < 10
                        ? repo.ai_detection_coverage_pct.toFixed(1)
                        : repo.ai_detection_coverage_pct.toFixed(0)}%`
                    : ''}
                </span>

                {/* Stabilization value + delta */}
                <div className="flex items-center gap-1.5 text-right">
                  <span className="text-sm font-medium">
                    {repo.stabilization_ratio !== null
                      ? `${(repo.stabilization_ratio * 100).toFixed(0)}%`
                      : '\u2014'}
                  </span>
                  <span
                    className={cn(
                      'flex w-4 items-center justify-center text-xs',
                      !hasDelta && 'invisible',
                      hasDelta && (deltaUp ? 'text-signal-purple' : 'text-signal-red'),
                    )}
                  >
                    {deltaUp ? (
                      <ArrowUp className="size-3" />
                    ) : (
                      <ArrowDown className="size-3" />
                    )}
                  </span>
                </div>
              </div>
            </Link>

            {showDeleteColumn && (
              <div className="flex items-center pr-2">
                <DeleteRepositoryDialog
                  repositoryId={repo.id}
                  repositoryName={repo.name}
                  organizationId={organizationId!}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    aria-label={t('repos.deleteButton')}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </DeleteRepositoryDialog>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
