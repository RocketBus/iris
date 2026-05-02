import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/debug';
import { env } from '@/lib/env';

/**
 * Debug route to check Google OAuth configuration
 * This helps diagnose configuration issues
 */
export async function GET(request: NextRequest) {

  try {
    const hasClientId = !!env.GOOGLE_CLIENT_ID;
    const hasClientSecret = !!env.GOOGLE_CLIENT_SECRET;

    return NextResponse.json({
      googleOAuth: {
        configured: hasClientId && hasClientSecret,
        hasClientId,
        hasClientSecret,
        clientIdLength: env.GOOGLE_CLIENT_ID?.length || 0,
        clientSecretLength: env.GOOGLE_CLIENT_SECRET?.length || 0,
        clientIdPrefix: env.GOOGLE_CLIENT_ID?.substring(0, 10) || 'N/A',
      },
      nextAuth: {
        hasUrl: !!env.NEXTAUTH_URL,
        hasSecret: !!env.NEXTAUTH_SECRET,
        url: env.NEXTAUTH_URL,
        expectedCallbackUrl: `${env.NEXTAUTH_URL}/api/auth/callback/google`,
      },
    });
  } catch (error) {
    logger.error('Error in auth debug route', { error });
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
