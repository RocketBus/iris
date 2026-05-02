import { NextRequest, NextResponse } from 'next/server';

import { logError } from '@/lib/debug';
import { send2FACodeEmail } from '@/lib/email';
import { supabaseAdmin } from '@/lib/supabase';
import { generate2FACode, store2FACode } from '@/lib/two-factor';

export async function POST(request: NextRequest) {

  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { message: 'User ID is required' },
        { status: 400 }
      );
    }

    // Get user from database
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, name')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      );
    }

    // Generate and send new email OTP code
    const code = generate2FACode();
    await store2FACode(user.id, code);
    await send2FACodeEmail(user.email, code, user.name || 'User');

    return NextResponse.json(
      { message: 'Verification code sent successfully' },
      { status: 200 }
    );
  } catch (error: unknown) {
    logError(error, 'resend-2fa');
    
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
