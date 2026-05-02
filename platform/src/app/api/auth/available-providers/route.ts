import { NextRequest, NextResponse } from 'next/server';

import { env } from '@/lib/env';

/**
 * API route to check which auth providers are available
 * This is needed because client-side code can't access server-side env vars
 */
export async function GET(request: NextRequest) {

  const providers = {
    google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    github: !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
  };

  return NextResponse.json({ providers });
}
