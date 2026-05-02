'use client';

import { useEffect, useState } from 'react';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Background } from '@/components/background';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBrowserTranslation } from '@/hooks/useBrowserTranslation';
import {
  PENDING_GITHUB_ORG_COOKIE,
  PENDING_GITHUB_ORG_COOKIE_MAX_AGE,
} from '@/lib/pending-github-org';

interface ClientOrg {
  id: number;
  login: string;
  name: string | null;
  description: string | null;
  avatarUrl: string;
}

function persistChoice(org: ClientOrg) {
  if (typeof document === 'undefined') return;
  const isSecure = window.location.protocol === 'https:';
  const value = encodeURIComponent(
    JSON.stringify({
      id: org.id,
      login: org.login,
      name: org.name,
      avatarUrl: org.avatarUrl,
    }),
  );
  const parts = [
    `${PENDING_GITHUB_ORG_COOKIE}=${value}`,
    'path=/',
    `max-age=${PENDING_GITHUB_ORG_COOKIE_MAX_AGE}`,
    'samesite=lax',
  ];
  if (isSecure) parts.push('secure');
  document.cookie = parts.join('; ');
}

export function SelectGitHubOrgClient() {
  const { t } = useBrowserTranslation();
  const router = useRouter();
  const [orgs, setOrgs] = useState<ClientOrg[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/github-orgs', { credentials: 'include' })
      .then(async (res) => {
        if (res.status === 412) {
          if (!cancelled) setError(t('selectGitHubOrg.noLink'));
          return null;
        }
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data) setOrgs(data.orgs ?? []);
      })
      .catch(() => {
        if (!cancelled) setError(t('selectGitHubOrg.error'));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  function choose(org: ClientOrg) {
    setPendingId(org.id);
    persistChoice(org);
    router.replace('/setup');
  }

  return (
    <Background>
      <section className="py-20 lg:pt-32 lg:pb-24">
        <div className="mx-auto w-full max-w-2xl px-4 space-y-6">
          <header className="text-center space-y-2">
            <Image
              src="/logo.svg"
              alt="logo"
              width={94}
              height={18}
              className="mx-auto dark:invert"
            />
            <h1 className="text-2xl font-bold">{t('selectGitHubOrg.title')}</h1>
            <p className="text-muted-foreground text-sm">
              {t('selectGitHubOrg.subtitle')}
            </p>
          </header>

          {error && (
            <Card>
              <CardContent className="py-6 text-center text-sm text-destructive">
                {error}
              </CardContent>
            </Card>
          )}

          {!error && orgs === null && (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                {t('selectGitHubOrg.loading')}
              </CardContent>
            </Card>
          )}

          {!error && orgs && orgs.length === 0 && (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                {t('selectGitHubOrg.empty')}
              </CardContent>
            </Card>
          )}

          {!error && orgs && orgs.length > 0 && (
            <div className="grid gap-3">
              {orgs.map((org) => (
                <Card key={org.id} className="hover:border-primary/40 transition-colors">
                  <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                    <Image
                      src={org.avatarUrl}
                      alt=""
                      width={40}
                      height={40}
                      className="rounded-md"
                      unoptimized
                    />
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">
                        {org.name || org.login}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground font-mono">
                        @{org.login}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => choose(org)}
                      disabled={pendingId === org.id}
                    >
                      {t('selectGitHubOrg.select')}
                    </Button>
                  </CardHeader>
                  {org.description && (
                    <CardContent className="pt-0 text-sm text-muted-foreground">
                      {org.description}
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}

          <div className="text-center">
            <Link
              href="/setup"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {t('selectGitHubOrg.manual')}
            </Link>
          </div>
        </div>
      </section>
    </Background>
  );
}
