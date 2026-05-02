import { redirect } from 'next/navigation';

import { getServerSession } from 'next-auth/next';

import { SelectGitHubOrgClient } from './client';

import { authOptions } from '@/lib/auth';

export default async function SelectGitHubOrgPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/auth/signin?callbackUrl=/auth/select-github-org');

  const accessToken = (session.user as { githubAccessToken?: string })
    .githubAccessToken;
  // Without a GitHub link there's nothing to pick. Fall back to manual setup
  // — never trap the user on a screen they can't action.
  if (!accessToken) redirect('/setup');

  return <SelectGitHubOrgClient />;
}
