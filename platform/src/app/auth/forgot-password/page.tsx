'use client';

import { useState } from 'react';

import Link from 'next/link';

import { Background } from '@/components/background';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBrowserTranslation } from '@/hooks/useBrowserTranslation';

export default function ForgotPassword() {
  const { t } = useBrowserTranslation();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setIsSuccess(true);
        setMessage(t('auth.forgotPassword.success'));
      } else {
        setMessage(data.message || t('auth.forgotPassword.error'));
      }
    } catch {
      setMessage(t('auth.forgotPassword.error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Background>
      <section className="py-28 lg:pt-44 lg:pb-32">
        <div className="container">
          <div className="flex flex-col gap-4">
            <Card className="mx-auto w-full max-w-sm">
              <CardHeader className="text-center">
                <h1 className="text-2xl font-bold">{t('auth.forgotPassword.title')}</h1>
                <p className="text-muted-foreground">
                  {t('auth.forgotPassword.subtitle')}
                </p>
              </CardHeader>
              <CardContent>
                {!isSuccess ? (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">{t('auth.forgotPassword.email')}</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder={t('auth.forgotPassword.emailPlaceholder')}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                    
                    {message && (
                      <p className={`text-sm ${message.includes('error') ? 'text-red-500' : 'text-green-500'}`}>
                        {message}
                      </p>
                    )}
                    
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? t('auth.forgotPassword.sending') : t('auth.forgotPassword.sendButton')}
                    </Button>
                  </form>
                ) : (
                  <div className="text-center space-y-4">
                    <div className="text-green-500 text-4xl">✓</div>
                    <p className="text-muted-foreground">{message}</p>
                    <Button asChild className="w-full">
                      <Link href="/auth/signin">{t('auth.forgotPassword.backToSignIn')}</Link>
                    </Button>
                  </div>
                )}

                {!isSuccess && (
                  <div className="text-center mt-4">
                    <Link href="/auth/signin" className="text-sm text-muted-foreground hover:text-primary">
                      {t('auth.forgotPassword.backToSignIn')}
                    </Link>
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
