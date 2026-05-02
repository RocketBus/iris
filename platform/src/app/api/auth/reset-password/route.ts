import { NextRequest, NextResponse } from 'next/server';

import { resetPassword } from '@/lib/auth';
import { logger } from '@/lib/debug';

export async function POST(request: NextRequest) {

  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json(
        { message: 'Token and password are required' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { message: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    // Additional password validation
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
    if (!passwordRegex.test(password)) {
      return NextResponse.json(
        { message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character' },
        { status: 400 }
      );
    }

    const result = await resetPassword(token, password);

    if (!result.success) {
      return NextResponse.json(
        { message: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: 'Password reset successfully' },
      { status: 200 }
    );
  } catch (error: unknown) {
    logger.error('Reset password error:', { error: error instanceof Error ? error.message : error });
    
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
