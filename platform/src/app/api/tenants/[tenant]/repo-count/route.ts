import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/debug';
import { getUserOrganizationContext } from '@/lib/microservice-auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> },
) {

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { tenant } = await params;
    if (!tenant) {
      return NextResponse.json(
        { message: 'Tenant slug is required' },
        { status: 400 },
      );
    }

    const organizationContext = await getUserOrganizationContext(
      session.user.id,
      tenant,
    );

    const { count, error } = await supabaseAdmin
      .from('repositories')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationContext.organizationId);

    if (error) {
      logger.error('repo-count query failed', { error });
      return NextResponse.json(
        { message: 'Failed to count repositories' },
        { status: 500 },
      );
    }

    const repoCount = count ?? 0;

    return NextResponse.json(
      { repoCount, hasRepos: repoCount > 0 },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Internal server error';
    const normalizedMessage = message.toLowerCase();
    const status =
      normalizedMessage.includes('not found') ? 404 :
      normalizedMessage.includes('not in organization') ? 403 :
      500;

    if (status === 500) {
      logger.error('repo-count route error', { error });
    }

    return NextResponse.json({ message }, { status });
  }
}
