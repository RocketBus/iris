import { notFound, redirect } from 'next/navigation';

import { getServerSession } from 'next-auth/next';

import { ConnectView } from './connect-view';

import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export default async function ConnectPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/auth/signin');

  const { tenant } = await params;

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .eq('slug', tenant)
    .single();

  if (!org) notFound();

  const { count } = await supabaseAdmin
    .from('repositories')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', org.id);

  const repoCount = count ?? 0;

  return <ConnectView tenantSlug={tenant} initialRepoCount={repoCount} />;
}
