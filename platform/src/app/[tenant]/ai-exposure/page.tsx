import { notFound, redirect } from 'next/navigation';

import { getServerSession } from 'next-auth/next';

import { AIExposureView } from './ai-exposure-view';

import { authOptions } from '@/lib/auth';
import { getOrgLatestPayloads } from '@/lib/queries/org-summary';
import { computeShadowAIExposure } from '@/lib/queries/shadow-ai';
import { getOrgReposSummary } from '@/lib/queries/temporal';
import { getServerTranslation } from '@/lib/server-translation';
import { supabaseAdmin } from '@/lib/supabase';


export default async function AIExposurePage({
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
  const payloads = await getOrgLatestPayloads(
    supabaseAdmin,
    org.id,
    repos.map((r) => r.id),
  );

  const exposure = computeShadowAIExposure(
    repos.map((r) => ({ id: r.id, name: r.name })),
    payloads,
  );

  const { t } = await getServerTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('aiExposure.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('aiExposure.subtitle')}</p>
      </div>

      <AIExposureView exposure={exposure} tenantSlug={tenant} />
    </div>
  );
}
