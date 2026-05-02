import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';

import { fetchAuditLogsForOrganization } from '@/lib/audit-log-service';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/debug';
import { isServerFeatureEnabled } from '@/lib/features/server';
import { getUserOrganizationContext } from '@/lib/microservice-auth';

const OWNER_ROLES = new Set(['owner', 'admin']);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> },
) {

  if (!isServerFeatureEnabled('auditLog')) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

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

    if (!OWNER_ROLES.has(organizationContext.role)) {
      return NextResponse.json(
        { message: 'Forbidden' },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const pageParam = Number.parseInt(searchParams.get('page') ?? '1', 10);
    const pageSizeParam = Number.parseInt(
      searchParams.get('pageSize') ?? '25',
      10,
    );

    const page = Number.isFinite(pageParam) ? pageParam : 1;
    const pageSize = Number.isFinite(pageSizeParam) ? pageSizeParam : 25;

    const result = await fetchAuditLogsForOrganization(
      organizationContext.organizationId,
      { page, pageSize },
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Internal server error';

    const normalizedMessage = message.toLowerCase();
    const status =
      normalizedMessage.includes('not found') ? 404 :
      normalizedMessage.includes('not in organization') ? 403 :
      500;

    if (status === 500) {
      logger.error('Audit logs route error', { error });
    }

    return NextResponse.json({ message }, { status });
  }
}


