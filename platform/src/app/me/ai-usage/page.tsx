import { notFound, redirect } from 'next/navigation';

import { getServerSession } from 'next-auth/next';

import { TrendChart } from './trend-chart';

import { Card, CardContent } from '@/components/ui/card';
import { authOptions } from '@/lib/auth';
import { getPersonalAIUsage } from '@/lib/queries/personal-ai-usage';
import { getServerTranslation } from '@/lib/server-translation';
import { supabaseAdmin } from '@/lib/supabase';

interface SessionOrg {
  id: string;
  slug: string;
  name: string;
}

export default async function PersonalAIUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/auth/signin?callbackUrl=/me/ai-usage');

  const sp = await searchParams;
  // Strict: this page is self-only. Any attempt to scope to another user is
  // treated as not-found, regardless of caller role.
  if (sp.user && sp.user !== session.user.id) notFound();

  const { t, language } = await getServerTranslation();
  const sessionOrgs = (session.user.organizations ?? []) as SessionOrg[];
  const orgs = sessionOrgs.map((o) => ({ id: o.id, slug: o.slug, name: o.name }));

  const usage = await getPersonalAIUsage(
    supabaseAdmin,
    { name: session.user.name ?? null, email: session.user.email ?? null },
    orgs,
  );

  const numberLocale = language === 'pt-BR' ? 'pt-BR' : 'en-US';
  const formatPct = (value: number | null, fractionDigits = 0) =>
    value === null ? '—' : `${value.toFixed(fractionDigits)}%`;
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(numberLocale, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-28 lg:pt-44">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{t('meAiUsage.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('meAiUsage.subtitle')}</p>
        <p className="text-xs text-muted-foreground">{t('meAiUsage.privacyNote')}</p>
      </header>

      {orgs.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t('meAiUsage.noOrgs')}
          </CardContent>
        </Card>
      ) : !usage.matched ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t('meAiUsage.noMatch', { name: session.user.name ?? session.user.email ?? '' })}
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label={t('meAiUsage.summary.repos')}
              value={usage.totalRepos.toString()}
            />
            <SummaryCard
              label={t('meAiUsage.summary.orgs')}
              value={usage.totalOrgs.toString()}
            />
            <SummaryCard
              label={t('meAiUsage.summary.avgAi')}
              value={formatPct(usage.avgAiCommitPct, 1)}
            />
            <SummaryCard
              label={t('meAiUsage.summary.hvWeeks')}
              value={usage.maxHighVelocityWeeks.toString()}
            />
          </section>

          <section className="space-y-2">
            <div>
              <h2 className="text-lg font-medium">{t('meAiUsage.trend.title')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('meAiUsage.trend.subtitle')}
              </p>
            </div>
            {usage.trend.length < 2 ? (
              <Card>
                <CardContent className="py-8 text-center text-xs text-muted-foreground">
                  {t('meAiUsage.trend.empty')}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <TrendChart data={usage.trend} locale={numberLocale} />
                </CardContent>
              </Card>
            )}
          </section>

          <section className="space-y-2">
            <div>
              <h2 className="text-lg font-medium">{t('meAiUsage.perRepo.title')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('meAiUsage.perRepo.subtitle')}
              </p>
            </div>
            <Card>
              <CardContent className="overflow-x-auto py-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 pr-4">{t('meAiUsage.perRepo.repo')}</th>
                      <th className="pb-2 pr-4">{t('meAiUsage.perRepo.org')}</th>
                      <th className="pb-2 pr-4 text-right">
                        {t('meAiUsage.perRepo.aiPct')}
                      </th>
                      <th className="pb-2 pr-4 text-right">
                        {t('meAiUsage.perRepo.hvWeeks')}
                      </th>
                      <th className="pb-2 text-right">
                        {t('meAiUsage.perRepo.lastSeen')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.perRepo.map((row) => (
                      <tr key={`${row.organizationSlug}/${row.repositoryId}`} className="border-b border-border/50">
                        <td className="py-2 pr-4 font-mono">{row.repositoryName}</td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {row.organizationName}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono">
                          {row.aiCommitPct.toFixed(0)}%
                        </td>
                        <td className="py-2 pr-4 text-right font-mono">
                          {row.highVelocityWeeks}
                        </td>
                        <td className="py-2 text-right text-muted-foreground">
                          {formatDate(row.lastSeenAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </section>
        </>
      )}

      <p className="text-xs text-muted-foreground">{t('meAiUsage.coverageNote')}</p>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 font-mono text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
