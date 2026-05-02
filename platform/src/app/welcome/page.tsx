import { redirect } from 'next/navigation';

import { getServerSession } from 'next-auth/next';

import { WelcomeGuide } from './welcome-guide';

import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

interface SessionOrg {
  slug: string;
}

function safeNext(raw: string | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/auth/signin?callbackUrl=/welcome');

  const sp = await searchParams;
  const next = safeNext(sp.next);

  // Skip the guide if the user has already dismissed it. Forwarding straight
  // to the resolved destination keeps deep-links functional.
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('preferences')
    .eq('id', session.user.id)
    .single();
  const dismissed = Boolean(
    (user?.preferences as { welcome_dismissed?: unknown } | null)
      ?.welcome_dismissed,
  );

  if (dismissed) {
    redirect(next ?? resolveFallback(session.user.organizations));
  }

  const fallback = resolveFallback(session.user.organizations);
  return <WelcomeGuide next={next ?? fallback} />;
}

function resolveFallback(orgs: unknown): string {
  if (Array.isArray(orgs) && orgs.length > 0) {
    const first = orgs[0] as SessionOrg;
    if (first?.slug) return `/${first.slug}/dashboard`;
  }
  return '/setup';
}
