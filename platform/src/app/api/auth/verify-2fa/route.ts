import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/debug';
import { verify2FACode } from '@/lib/two-factor';

export async function POST(request: NextRequest) {

  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { code } = await request.json();

    if (!code) {
      return NextResponse.json(
        { message: 'Verification code is required' },
        { status: 400 }
      );
    }

    if (code.length !== 6) {
      return NextResponse.json(
        { message: 'Verification code must be 6 digits' },
        { status: 400 }
      );
    }

    const isValid = await verify2FACode(session.user.id, code);

    if (!isValid) {
      return NextResponse.json(
        { message: 'Invalid or expired verification code' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: '2FA verification successful' },
      { status: 200 }
    );
  } catch (error: unknown) {
    logger.error('2FA verification error:', { error: error instanceof Error ? error.message : error });
    
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
