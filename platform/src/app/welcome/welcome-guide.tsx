'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { dismissWelcomeAction } from '@/actions/profile-actions';
import { Background } from '@/components/background';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBrowserTranslation } from '@/hooks/useBrowserTranslation';

interface WelcomeGuideProps {
  next: string;
}

export function WelcomeGuide({ next }: WelcomeGuideProps) {
  const { t } = useBrowserTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function dismiss() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await dismissWelcomeAction();
        if (!result?.data?.success) {
          throw new Error('Dismiss failed');
        }
        router.replace(next);
      } catch {
        setError(t('welcomeGuide.error'));
      }
    });
  }

  return (
    <Background>
      <section className="py-20 lg:pt-32 lg:pb-24">
        <div className="mx-auto w-full max-w-3xl px-4 space-y-6">
          <header className="space-y-2 text-center">
            <h1 className="text-3xl font-bold tracking-tight">
              {t('welcomeGuide.title')}
            </h1>
            <p className="text-muted-foreground">{t('welcomeGuide.subtitle')}</p>
          </header>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t('welcomeGuide.whatItMeasures.title')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>· {t('welcomeGuide.whatItMeasures.item1')}</li>
                  <li>· {t('welcomeGuide.whatItMeasures.item2')}</li>
                  <li>· {t('welcomeGuide.whatItMeasures.item3')}</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-signal-yellow/30">
              <CardHeader>
                <CardTitle className="text-base">
                  {t('welcomeGuide.whatItIsNot.title')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>· {t('welcomeGuide.whatItIsNot.item1')}</li>
                  <li>· {t('welcomeGuide.whatItIsNot.item2')}</li>
                  <li>· {t('welcomeGuide.whatItIsNot.item3')}</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t('welcomeGuide.steps.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                <li>
                  <p className="font-medium">{t('welcomeGuide.steps.step1Title')}</p>
                  <p className="text-muted-foreground">
                    {t('welcomeGuide.steps.step1Desc')}
                  </p>
                </li>
                <li>
                  <p className="font-medium">{t('welcomeGuide.steps.step2Title')}</p>
                  <p className="text-muted-foreground">
                    {t('welcomeGuide.steps.step2Desc')}
                  </p>
                </li>
                <li>
                  <p className="font-medium">{t('welcomeGuide.steps.step3Title')}</p>
                  <p className="text-muted-foreground">
                    {t('welcomeGuide.steps.step3Desc')}
                  </p>
                </li>
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t('welcomeGuide.whereToLook.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t('welcomeGuide.whereToLook.intro')}
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>· {t('welcomeGuide.whereToLook.shadowAI')}</li>
                <li>· {t('welcomeGuide.whereToLook.adoption')}</li>
                <li>· {t('welcomeGuide.whereToLook.healthMap')}</li>
              </ul>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            {t('welcomeGuide.footer')}
          </p>

          {error && (
            <p className="text-center text-sm text-destructive">{error}</p>
          )}

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button onClick={dismiss} disabled={pending}>
              {t('welcomeGuide.cta')}
            </Button>
            <Button variant="ghost" onClick={dismiss} disabled={pending}>
              {t('welcomeGuide.skip')}
            </Button>
          </div>
        </div>
      </section>
    </Background>
  );
}
