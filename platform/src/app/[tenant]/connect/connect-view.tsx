'use client';

import { useEffect, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Check, Copy, Loader2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';

interface ConnectViewProps {
  tenantSlug: string;
  initialRepoCount: number;
}

const POLL_INTERVAL_MS = 5000;

function CommandLine({ command }: { command: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard unavailable — no-op */
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 p-2 font-mono text-xs">
      <span className="select-none text-muted-foreground">$</span>
      <code className="flex-1 truncate">{command}</code>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={copy}
        className="h-7 gap-1 px-2 text-xs"
        aria-label={copied ? t('connect.copied') : t('connect.copy')}
      >
        {copied ? (
          <>
            <Check className="size-3" />
            {t('connect.copied')}
          </>
        ) : (
          <>
            <Copy className="size-3" />
            {t('connect.copy')}
          </>
        )}
      </Button>
    </div>
  );
}

export function ConnectView({ tenantSlug, initialRepoCount }: ConnectViewProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [repoCount, setRepoCount] = useState(initialRepoCount);

  const detected = repoCount > initialRepoCount;
  const hasExistingRepos = initialRepoCount > 0;

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/tenants/${tenantSlug}/repo-count`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const body: { repoCount?: number } = await res.json();
        if (cancelled || typeof body.repoCount !== 'number') return;
        setRepoCount(body.repoCount);
      } catch {
        /* Ignore transient errors — next tick will retry */
      }
    };

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [tenantSlug]);

  useEffect(() => {
    if (!detected) return;
    const timeout = setTimeout(() => {
      router.push(`/${tenantSlug}/dashboard`);
      router.refresh();
    }, 1500);
    return () => clearTimeout(timeout);
  }, [detected, router, tenantSlug]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t('connect.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('connect.subtitle')}
        </p>
      </div>

      {hasExistingRepos && !detected && (
        <Card className="border-signal-purple/30 bg-signal-purple/5">
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <p className="text-sm text-muted-foreground">
              {t('connect.alreadyConnected', {
                count: initialRepoCount,
                repoLabel:
                  initialRepoCount === 1
                    ? t('connect.repoSingular')
                    : t('connect.repoPlural'),
              })}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/${tenantSlug}/dashboard`}>
                {t('connect.goToDashboard')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              1
            </span>
            {t('connect.step1Label')}
          </CardTitle>
          <CardDescription>{t('connect.step1Hint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <CommandLine command="curl -fsSL https://iris.clickbus.com/install.sh | sh" />
          <p className="pt-1 text-xs text-muted-foreground">
            {t('connect.step1Alt')}{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">
              pipx install iris
            </code>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              2
            </span>
            {t('connect.step2Label')}
          </CardTitle>
          <CardDescription>{t('connect.step2Hint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <CommandLine command="iris login" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              3
            </span>
            {t('connect.step3Label')}
          </CardTitle>
          <CardDescription>{t('connect.step3Hint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <CommandLine command="iris /path/to/your/repo --push" />
        </CardContent>
      </Card>

      <div
        className={cn(
          'flex items-center gap-3 rounded-md border p-4 text-sm',
          detected
            ? 'border-signal-purple/40 bg-signal-purple/5 text-signal-purple'
            : 'border-border bg-muted/30 text-muted-foreground',
        )}
      >
        {detected ? (
          <>
            <Sparkles className="size-4" />
            <span>{t('connect.detected')}</span>
          </>
        ) : (
          <>
            <Loader2 className="size-4 animate-spin" />
            <div className="flex flex-col">
              <span>{t('connect.waiting')}</span>
              <span className="text-xs">{t('connect.waitingHint')}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
