import { notFound, redirect } from 'next/navigation';

import { getServerSession } from 'next-auth/next';

import { RepoList } from '../dashboard/repo-list';

import { authOptions } from '@/lib/auth';
import { getOrgReposSummary } from '@/lib/queries/temporal';
import { getServerTranslation } from '@/lib/server-translation';
import { supabaseAdmin } from '@/lib/supabase';

export default async function ReposPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/auth/signin');

  const { tenant } = await params;
  const { t } = await getServerTranslation();

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('slug', tenant)
    .single();

  if (!org) notFound();

  const { data: membership } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('organization_id', org.id)
    .single();

  const role = membership?.role as 'owner' | 'admin' | 'member' | undefined;
  const canDelete = role === 'owner' || role === 'admin';

  const repoSummaries = await getOrgReposSummary(supabaseAdmin, org.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('repos.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('repos.subtitle', { count: repoSummaries.length, org: org.name })}
        </p>
      </div>

      <RepoList
        repos={repoSummaries}
        orgSlug={tenant}
        organizationId={org.id}
        canDelete={canDelete}
        showSearch
      />
    </div>
  );
}
