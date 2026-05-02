import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/debug';
import {
  generateAccessToken,
  verifyRefreshToken,
  getUserOrganizationContext,
} from '@/lib/microservice-auth';
import { getTenantFromRequest } from '@/lib/tenant';

export async function POST(request: NextRequest) {

  try {
    const { refreshToken } = await request.json();

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Refresh token is required' },
        { status: 400 }
      );
    }

    // Verify refresh token and get user ID
    const userId = await verifyRefreshToken(refreshToken);

    // Get session to verify user is still authenticated
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || session.user.id !== userId) {
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
      await getUserOrganizationContext(userId, tenantContext.tenant);

    // Generate new access token
    const accessToken = generateAccessToken(
      userId,
      session.user.email!,
      organizationId,
      organizationSlug,
      role,
      permissions
    );

    return NextResponse.json({
      accessToken,
      expiresIn: 3600, // 1 hour in seconds
      tokenType: 'Bearer',
    });
  } catch (error: unknown) {
    logger.error('Error refreshing microservice token:', { error: error instanceof Error ? error.message : error });
    
    const errorMessage = error instanceof Error ? error.message : 'Invalid refresh token';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 401 }
    );
  }
}

