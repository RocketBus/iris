'use client';

import { Suspense, useState, useEffect } from 'react';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { Background } from '@/components/background';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBrowserTranslation } from '@/hooks/useBrowserTranslation';

function ResetPasswordContent() {
  const { t } = useBrowserTranslation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (!tokenParam) {
      setMessage(t('auth.resetPassword.invalidToken'));
      return;
    }
    setToken(tokenParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    // Validate passwords match
    if (password !== confirmPassword) {
      setMessage(t('auth.resetPassword.passwordMismatch'));
      setIsLoading(false);
      return;
    }

    // Validate password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
    if (!passwordRegex.test(password) || password.length < 8) {
      setMessage(t('auth.resetPassword.weakPassword'));
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setIsSuccess(true);
        setMessage(t('auth.resetPassword.success'));
        setTimeout(() => {
          router.push('/auth/signin');
        }, 2000);
      } else {
        setMessage(data.message || t('auth.resetPassword.error'));
      }
    } catch {
      setMessage(t('auth.resetPassword.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinue = () => {
    router.push('/auth/signin');
  };

  if (!token) {
    return (
      <Background>
        <section className="py-28 lg:pt-44 lg:pb-32">
          <div className="container">
            <div className="flex flex-col gap-4">
              <Card className="mx-auto w-full max-w-sm">
              <CardHeader className="text-center">
                <h1 className="text-2xl font-bold">{t('auth.resetPassword.invalidToken')}</h1>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-muted-foreground mb-4">{message}</p>
                <Button asChild className="w-full">
                  <Link href="/auth/forgot-password">{t('auth.forgotPassword.sendButton')}</Link>
                </Button>
              </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </Background>
    );
  }

  return (
    <Background>
      <section className="py-28 lg:pt-44 lg:pb-32">
        <div className="container">
          <div className="flex flex-col gap-4">
            <Card className="mx-auto w-full max-w-sm">
              <CardHeader className="text-center">
                <h1 className="text-2xl font-bold">{t('auth.resetPassword.title')}</h1>
                <p className="text-muted-foreground">
                  {t('auth.resetPassword.subtitle')}
                </p>
              </CardHeader>
              <CardContent>
                {!isSuccess ? (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="password">{t('auth.resetPassword.newPassword')}</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder={t('auth.resetPassword.newPasswordPlaceholder')}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">{t('auth.resetPassword.confirmPassword')}</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder={t('auth.resetPassword.confirmPasswordPlaceholder')}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                    </div>
                    
                    {message && (
                      <p className={`text-sm ${message.includes('successfully') || message.includes('sucesso') ? 'text-green-500' : 'text-red-500'}`}>
                        {message}
                      </p>
                    )}
                    
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? t('auth.resetPassword.resetting') : t('auth.resetPassword.resetButton')}
                    </Button>
                  </form>
                ) : (
                  <div className="text-center space-y-4">
                    <div className="text-green-500 text-4xl">✓</div>
                    <p className="text-muted-foreground">{message}</p>
                    <Button onClick={handleContinue} className="w-full">
                      {t('auth.resetPassword.backToSignIn')}
                    </Button>
                  </div>
                )}
                
                <div className="text-center mt-4">
                  <Link href="/auth/signin" className="text-sm text-muted-foreground hover:text-primary">
                    {t('auth.resetPassword.backToSignIn')}
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </Background>
  );
}

function ResetPasswordFallback() {
  const { t } = useBrowserTranslation();
  return <div>{t('common.loading')}</div>;
}

export default function ResetPassword() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
