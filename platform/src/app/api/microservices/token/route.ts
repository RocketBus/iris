import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';

import { logAuditEvent } from '@/lib/audit-logger';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/debug';
import {
  generateAccessToken,
  generateRefreshToken,
  getUserOrganizationContext,
} from '@/lib/microservice-auth';
import { getTenantFromRequest } from '@/lib/tenant';

export async function POST(request: NextRequest) {

  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get tenant from request
    const tenantContext = await getTenantFromRequest();
    
    if (!tenantContext.tenant) {
      return NextResponse.json(
        { error: 'No organization context found. Please access from within an organization.' },
        { status: 400 }
      );
    }

    // Get user's organization context
    const { organizationId, organizationSlug, role, permissions } = 
      await getUserOrganizationContext(session.user.id, tenantContext.tenant);

    // Generate access token
    const accessToken = generateAccessToken(
      session.user.id,
      session.user.email!,
      organizationId,
      organizationSlug,
      role,
      permissions
    );

    // Generate refresh token
    const refreshToken = await generateRefreshToken(session.user.id);

    await logAuditEvent({
      organizationId,
      actorId: session.user.id,
      action: 'microservice.token.generated',
      targetType: 'microservice_token',
      metadata: {
        tenantSlug: organizationSlug,
        role,
        permissions,
      },
    });

    return NextResponse.json({
      accessToken,
      refreshToken,
      expiresIn: 3600, // 1 hour in seconds
      tokenType: 'Bearer',
    });
  } catch (error: unknown) {
    logger.error('Error generating microservice token:', { error: error instanceof Error ? error.message : error });
    
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

