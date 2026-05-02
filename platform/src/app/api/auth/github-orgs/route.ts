import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import { logError } from '@/lib/debug';
import { listUserOrgs } from '@/lib/github';

export async function GET(request: NextRequest) {

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const accessToken = (session.user as { githubAccessToken?: string }).githubAccessToken;
  if (!accessToken) {
    return NextResponse.json({ error: 'no_github_link' }, { status: 412 });
  }

  try {
    const orgs = await listUserOrgs(accessToken);
    return NextResponse.json({ orgs });
  } catch (error) {
    logError(error, 'GET /api/auth/github-orgs');
    return NextResponse.json({ error: 'github_api_error' }, { status: 502 });
  }
}
