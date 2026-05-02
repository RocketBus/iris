'use client';

import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck, Loader2, AlertTriangle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { disableMFAAction } from '@/actions/profile-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/hooks/useTranslation';
import { disable2FASchema, type Disable2FAData } from '@/lib/form-schema';

interface Disable2FADialogProps {
  children: React.ReactNode;
}

export function Disable2FADialog({ children }: Disable2FADialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<Disable2FAData>({
    resolver: zodResolver(disable2FASchema),
    defaultValues: {
      password: '',
    },
  });

  const onSubmit = async (data: Disable2FAData) => {
    setIsLoading(true);
    try {
      const result = await disableMFAAction(data);

      if (result?.data?.success) {
        toast.success(t('security.twoFactor.disableSuccess'));
        form.reset();
        setOpen(false);
        // Refresh page to update status
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        toast.error(result?.data?.message || t('security.twoFactor.disableError'));
      }
    } catch (error) {
      console.error('Error disabling 2FA:', error);
      toast.error(error instanceof Error ? error.message : t('security.twoFactor.disableError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {t('security.twoFactor.disableDialogTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('security.twoFactor.disableDialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t('security.twoFactor.disableWarning')}
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('security.twoFactor.passwordLabel')}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={t('security.twoFactor.passwordPlaceholder')}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('security.twoFactor.passwordDescription')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  form.reset();
                }}
                disabled={isLoading}
              >
                {t('security.twoFactor.cancel')}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('security.twoFactor.disableButton')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

