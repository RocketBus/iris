'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState } from 'react';

import { useSearchParams, useRouter } from 'next/navigation';

import { Loader2, CheckCircle, XCircle, LogIn } from 'lucide-react';
import { useSession } from 'next-auth/react';

import { acceptInvitationAction } from '@/actions/team-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useBrowserTranslation } from '@/hooks/useBrowserTranslation';

function AcceptInvitePageContent() {
  const { t } = useBrowserTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    organizationSlug?: string;
  } | null>(null);

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setResult({
        success: false,
        message: t('acceptInvite.errors.invalidLink')
      });
      return;
    }

    if (status === 'loading') {
      return; // Still loading session
    }

    if (status === 'unauthenticated') {
      // User not logged in, redirect to signup with invite token
      router.push(`/auth/signup?invite=${token}`);
      return;
    }

    // User is logged in, process the invitation
    if (status === 'authenticated' && session?.user) {
      processInvitation();
    }
  }, [token, status, session, router]);

  const processInvitation = async () => {
    if (!token) return;

    setIsProcessing(true);
    try {
      const result = await acceptInvitationAction({ token });
      
      if (result?.data?.success) {
        setResult({
          success: true,
          message: result.data.message,
          organizationSlug: result.data.organizationSlug
        });
        
        // Redirect to organization dashboard after 2 seconds
        setTimeout(() => {
          const organizationSlug = result.data?.organizationSlug;
          if (organizationSlug) {
            router.push(`/${organizationSlug}/dashboard`);
          } else {
            router.push('/dashboard');
          }
        }, 2000);
      } else {
        setResult({
          success: false,
          message: result?.data?.message || t('acceptInvite.errors.failedAccept')
        });
      }
    } catch (error) {
      console.error('Error accepting invitation:', error);
      setResult({
        success: false,
        message: error instanceof Error ? error.message : t('acceptInvite.errors.unexpected')
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSignIn = () => {
    if (token) {
      router.push(`/auth/signin?invite=${token}`);
    } else {
      router.push('/auth/signin');
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">{t('acceptInvite.invalid.title')}</CardTitle>
            <CardDescription className="text-center">
              {t('acceptInvite.invalid.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                {t('acceptInvite.invalid.noToken')}
              </AlertDescription>
            </Alert>
            <Button onClick={() => router.push('/')} className="w-full">
              {t('acceptInvite.goToHomepage')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">{t('acceptInvite.processing.title')}</CardTitle>
            <CardDescription className="text-center">
              {t('acceptInvite.processing.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">
              {result.success ? t('acceptInvite.result.successTitle') : t('acceptInvite.result.failedTitle')}
            </CardTitle>
            <CardDescription className="text-center">
              {result.success
                ? t('acceptInvite.result.successDescription')
                : t('acceptInvite.result.failedDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant={result.success ? 'default' : 'destructive'}>
              {result.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                {result.message}
              </AlertDescription>
            </Alert>

            {result.success && result.organizationSlug ? (
              <Button
                onClick={() => router.push(`/${result.organizationSlug}/dashboard`)}
                className="w-full"
              >
                {t('acceptInvite.goToDashboard')}
              </Button>
            ) : (
              <div className="space-y-2">
                <Button onClick={() => router.push('/')} className="w-full">
                  {t('acceptInvite.goToHomepage')}
                </Button>
                <Button onClick={handleSignIn} variant="outline" className="w-full">
                  <LogIn className="mr-2 h-4 w-4" />
                  {t('acceptInvite.signIn')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Default loading state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">{t('common.loading')}</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    </div>
  );
}

function AcceptInviteLoading() {
  const { t } = useBrowserTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">{t('acceptInvite.fallback.title')}</CardTitle>
          <CardDescription className="text-center">
            {t('acceptInvite.fallback.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<AcceptInviteLoading />}>
      <AcceptInvitePageContent />
    </Suspense>
  );
}
