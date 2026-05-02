'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { Background } from '@/components/background';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useBrowserTranslation } from '@/hooks/useBrowserTranslation';

function VerifyEmailContent() {
  const { t } = useBrowserTranslation();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const verifyEmail = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('success');
        setMessage(t('auth.verifyEmail.verified'));
        setTimeout(() => {
          router.push('/auth/signin');
        }, 2000);
      } else {
        setStatus('error');
        setMessage(data.message || t('auth.verifyEmail.invalidToken'));
      }
    } catch {
      setStatus('error');
      setMessage(t('auth.verifyEmail.error'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage(t('auth.verifyEmail.invalidToken'));
      return;
    }

    verifyEmail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, verifyEmail]);

  const handleContinue = () => {
    router.push('/auth/signin');
  };

  return (
    <Background>
      <section className="py-28 lg:pt-44 lg:pb-32">
        <div className="container">
          <div className="flex flex-col gap-4">
            <Card className="mx-auto w-full max-w-sm">
              <CardHeader className="text-center">
                <h1 className="text-2xl font-bold">
                  {status === 'verifying' && t('auth.verifyEmail.title')}
                  {status === 'success' && t('auth.verifyEmail.title')}
                  {status === 'error' && t('auth.verifyEmail.title')}
                </h1>
                <p className="text-muted-foreground mt-2">
                  {t('auth.verifyEmail.subtitle')}
                </p>
              </CardHeader>
              <CardContent className="text-center">
                {status === 'verifying' && (
                  <div className="space-y-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    <p className="text-muted-foreground">
                      {t('auth.verifyEmail.checkInbox')}
                    </p>
                  </div>
                )}

                {status === 'success' && (
                  <div className="space-y-4">
                    <div className="text-green-500 text-4xl">✓</div>
                    <p className="text-muted-foreground">{message}</p>
                    <Button onClick={handleContinue} className="w-full">
                      {t('auth.verifyEmail.backToSignIn')}
                    </Button>
                  </div>
                )}

                {status === 'error' && (
                  <div className="space-y-4">
                    <div className="text-red-500 text-4xl">✗</div>
                    <p className="text-muted-foreground">{message}</p>
                    <Button onClick={() => router.push('/auth/signup')} variant="outline" className="w-full">
                      {t('auth.signup.title')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </Background>
  );
}

function VerifyEmailFallback() {
  const { t } = useBrowserTranslation();
  return <div>{t('common.loading')}</div>;
}

export default function VerifyEmail() {
  return (
    <Suspense fallback={<VerifyEmailFallback />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
