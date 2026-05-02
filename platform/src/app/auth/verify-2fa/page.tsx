'use client';

import { useState, Suspense } from 'react';

import { useSearchParams } from 'next/navigation';

import { signIn } from 'next-auth/react';

import { Background } from '@/components/background';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBrowserTranslation } from '@/hooks/useBrowserTranslation';

function Verify2FAContent() {
  const { t } = useBrowserTranslation();
  const searchParams = useSearchParams();
  
  const method = searchParams.get('method') || 'email'; // 'totp' or 'email'
  const userId = searchParams.get('userId') || '';
  const email = searchParams.get('email') || '';
  
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isResending, setIsResending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    if (!userId) {
      setMessage(t('auth.verify2fa.error'));
      setIsLoading(false);
      return;
    }

    if (code.length !== 6) {
      setMessage(t('auth.verify2fa.invalidCode'));
      setIsLoading(false);
      return;
    }

    try {
      // Verify code and get login token
      const response = await fetch('/api/auth/complete-2fa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, code, method }),
      });

      const data = await response.json();

      if (response.ok && data.success && data.loginToken) {
        // Use login token to complete sign in
        const signInResult = await signIn('credentials', {
          loginToken: data.loginToken,
          redirect: false,
        });

        if (signInResult?.ok) {
          // Wait a moment for session to be established
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Fetch organizations and redirect
          try {
            const orgResponse = await fetch('/api/auth/get-user-orgs', {
              method: 'GET',
              credentials: 'include',
            });

            if (orgResponse.ok) {
              const { organizations } = await orgResponse.json();
              
              if (organizations && organizations.length > 0) {
                const firstOrg = organizations[0];
                window.location.href = `/${firstOrg.slug}/dashboard`;
                return;
              }
            }
          } catch (error) {
            console.error('Error fetching organizations:', error);
          }
          
          // Redirect to setup if no organizations
          window.location.href = '/setup';
        } else {
          setMessage(t('auth.verify2fa.error'));
        }
      } else {
        setMessage(data.message || t('auth.verify2fa.invalidCode'));
      }
    } catch {
      setMessage(t('auth.verify2fa.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (method !== 'email') {
      return; // Only email method supports resend
    }

    setIsResending(true);
    setMessage('');

    try {
      const response = await fetch('/api/auth/resend-2fa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(t('auth.verify2fa.codeSent') || 'Code sent successfully');
      } else {
        setMessage(data.message || t('auth.verify2fa.error'));
      }
    } catch {
      setMessage(t('auth.verify2fa.error'));
    } finally {
      setIsResending(false);
    }
  };

  const getSubtitle = () => {
    if (method === 'totp') {
      return t('auth.verify2fa.subtitleTotp');
    }
    return t('auth.verify2fa.subtitleEmail', { email });
  };

  return (
    <Background>
      <section className="py-28 lg:pt-44 lg:pb-32">
        <div className="container">
          <div className="flex flex-col gap-4">
            <Card className="mx-auto w-full max-w-sm">
              <CardHeader className="text-center">
                <h1 className="text-2xl font-bold">{t('auth.verify2fa.title')}</h1>
                <p className="text-muted-foreground">
                  {getSubtitle()}
                </p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">{t('auth.verify2fa.code')}</Label>
                    <Input
                      id="code"
                      type="text"
                      placeholder={t('auth.verify2fa.codePlaceholder')}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      maxLength={6}
                      required
                      className="text-center text-2xl tracking-widest"
                    />
                  </div>
                  
                  {message && (
                    <p className={`text-sm ${message.includes('sent') || message.includes('enviado') ? 'text-green-500' : 'text-red-500'}`}>
                      {message}
                    </p>
                  )}
                  
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? t('auth.verify2fa.verifying') : t('auth.verify2fa.verifyButton')}
                  </Button>
                </form>
                
                {method === 'email' && (
                  <div className="text-center mt-4">
                    <Button
                      variant="link"
                      onClick={handleResendCode}
                      disabled={isResending}
                      className="text-sm"
                    >
                      {isResending ? t('auth.verify2fa.verifying') : t('auth.verify2fa.resendCode')}
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

function Verify2FAFallback() {
  const { t } = useBrowserTranslation();
  return <div>{t('common.loading')}</div>;
}

export default function Verify2FA() {
  return (
    <Suspense fallback={<Verify2FAFallback />}>
      <Verify2FAContent />
    </Suspense>
  );
}
