import { notFound, redirect } from 'next/navigation';

import { getServerSession } from 'next-auth/next';

import { CompareView } from './compare-view';

import { authOptions } from '@/lib/auth';
import { getOrgReposSummary } from '@/lib/queries/temporal';
import { getServerTranslation } from '@/lib/server-translation';
import { supabaseAdmin } from '@/lib/supabase';

export default async function ComparePage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/auth/signin');

  const { tenant } = await params;

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('slug', tenant)
    .single();

  if (!org) notFound();

  const repos = await getOrgReposSummary(supabaseAdmin, org.id);
  const { t } = await getServerTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('compare.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('compare.subtitle')}</p>
      </div>

      <CompareView repos={repos} />
    </div>
  );
}
