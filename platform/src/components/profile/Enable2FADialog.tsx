'use client';

import { useState, useEffect } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck, Loader2, QrCode, Copy, Download } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { generateMFASecretAction, verifyAndEnableMFAAction } from '@/actions/profile-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/hooks/useTranslation';
import { enable2FASchema, type Enable2FAData } from '@/lib/form-schema';

interface Enable2FADialogProps {
  children: React.ReactNode;
}

type Step = 'qrcode' | 'verify' | 'complete';

interface MfaSecretData {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export function Enable2FADialog({ children }: Enable2FADialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>('qrcode');
  const [mfaData, setMfaData] = useState<MfaSecretData | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const form = useForm<Enable2FAData>({
    resolver: zodResolver(enable2FASchema),
    defaultValues: {
      verificationCode: '',
      secret: '',
    },
  });

  useEffect(() => {
    if (open && step === 'qrcode' && !mfaData) {
      generateSecret();
    }
    // Reset step when dialog opens
    if (open && step !== 'qrcode') {
      setStep('qrcode');
    }
  }, [open]);

  // Update form secret when mfaData is available
  useEffect(() => {
    if (mfaData?.secret) {
      form.setValue('secret', mfaData.secret);
    }
  }, [mfaData, form]);

  const generateSecret = async () => {
    setIsLoading(true);
    try {
      const result = await generateMFASecretAction();
      if (result?.data?.success && result.data.data) {
        setMfaData(result.data.data);
      } else {
        const apiMessage =
          result?.data && 'message' in result.data
            ? (result.data as { message?: string }).message
            : undefined;
        toast.error(apiMessage || t('security.twoFactor.generateError'));
      }
    } catch (error) {
      console.error('Error generating MFA secret:', error);
      toast.error(error instanceof Error ? error.message : t('security.twoFactor.generateError'));
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: Enable2FAData) => {
    if (!mfaData?.secret) {
      toast.error(t('security.twoFactor.secretNotFound'));
      return;
    }

    setIsLoading(true);
    try {
      // Include the secret in the verification request
      const result = await verifyAndEnableMFAAction({
        ...data,
        secret: mfaData.secret,
      });

      if (result?.data?.success) {
        setBackupCodes(result.data.data?.backupCodes || []);
        setStep('complete');
        toast.success(t('security.twoFactor.success'));
        // Note: Page will refresh after dialog closes to show updated status
      } else {
        toast.error(result?.data?.message || t('security.twoFactor.enableError'));
      }
    } catch (error) {
      console.error('Error enabling 2FA:', error);
      toast.error(error instanceof Error ? error.message : t('security.twoFactor.enableError'));
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t('security.twoFactor.copied'));
  };

  const downloadBackupCodes = () => {
    const content = backupCodes.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'backup-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
    toast.success(t('security.twoFactor.backupCodesDownloaded'));
  };

  const handleClose = () => {
    const wasEnabled = step === 'complete';
    setOpen(false);
    setStep('qrcode');
    setMfaData(null);
    setBackupCodes([]);
    form.reset();
    // Refresh page if 2FA was successfully enabled
    if (wasEnabled) {
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (isOpen) {
        setOpen(true);
      } else {
        handleClose();
      }
    }}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {t('security.twoFactor.dialogTitle')}
          </DialogTitle>
          <DialogDescription>
            {step === 'qrcode' && t('security.twoFactor.dialogDescriptionQrcode')}
            {step === 'verify' && t('security.twoFactor.dialogDescriptionVerify')}
            {step === 'complete' && t('security.twoFactor.dialogDescriptionComplete')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Step 1: QR Code and Secret */}
          {step === 'qrcode' && (
            <div className="space-y-4">
              {isLoading && !mfaData ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : mfaData ? (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{t('security.twoFactor.step1FullTitle')}</CardTitle>
                      <CardDescription>
                        {t('security.twoFactor.step1FullDescription')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex justify-center">
                        {mfaData.qrCodeUrl ? (
                          <img
                            src={mfaData.qrCodeUrl}
                            alt={t('security.twoFactor.qrCodeAlt')}
                            className="w-48 h-48 border-2 border-gray-300 rounded-lg"
                          />
                        ) : (
                          <div className="flex items-center justify-center w-48 h-48 bg-white border-2 border-dashed border-gray-300 rounded-lg">
                            <QrCode className="h-32 w-32 text-gray-400" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{t('security.twoFactor.secretKey')}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(mfaData.secret)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <code className="block text-xs bg-muted p-2 rounded break-all">
                          {mfaData.secret}
                        </code>
                        <p className="text-xs text-muted-foreground">
                          {t('security.twoFactor.secretKeyHint')}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Step 2: Verification Code - Same Modal */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{t('security.twoFactor.step2FullTitle')}</CardTitle>
                      <CardDescription>
                        {t('security.twoFactor.step2FullDescription')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                          <FormField
                            control={form.control}
                            name="verificationCode"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('security.twoFactor.verificationCode')}</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder={t('security.twoFactor.verificationCodePlaceholder')}
                                    maxLength={6}
                                    className="text-center text-2xl tracking-widest"
                                    onChange={(e) => {
                                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                                      field.onChange(value);
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('security.twoFactor.verifyAndEnable')}
                          </Button>
                        </form>
                      </Form>
                    </CardContent>
                  </Card>
                </>
              ) : null}
            </div>
          )}

          {/* Step 2: Verification Code (when coming back from complete) */}
          {step === 'verify' && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t('security.twoFactor.step2FullTitle')}</CardTitle>
                    <CardDescription>
                      {t('security.twoFactor.step2FullDescription')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="verificationCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('security.twoFactor.verificationCode')}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder={t('security.twoFactor.verificationCodePlaceholder')}
                              maxLength={6}
                              className="text-center text-2xl tracking-widest"
                              onChange={(e) => {
                                const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                                field.onChange(value);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t('security.twoFactor.verifyAndEnable')}
                    </Button>
                  </CardContent>
                </Card>
              </form>
            </Form>
          )}

          {/* Step 3: Backup Codes */}
          {step === 'complete' && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('security.twoFactor.step3FullTitle')}</CardTitle>
                  <CardDescription>
                    {t('security.twoFactor.step3FullDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted rounded-lg p-4 space-y-2 max-h-48 overflow-y-auto">
                    {backupCodes.map((code, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between font-mono text-sm"
                      >
                        <span>{code}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(code)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={downloadBackupCodes}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {t('security.twoFactor.downloadCodes')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => copyToClipboard(backupCodes.join('\n'))}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      {t('security.twoFactor.copyAll')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'complete' ? (
            <Button type="button" onClick={handleClose} className="w-full">
              {t('security.twoFactor.done')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
              className="w-full"
            >
              {t('security.twoFactor.cancel')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

