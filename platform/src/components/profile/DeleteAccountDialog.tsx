'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';



import { deleteAccountAction } from '@/actions/profile-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { deleteAccountSchema, type DeleteAccountData } from '@/lib/form-schema';

interface DeleteAccountDialogProps {
  children: React.ReactNode;
  isOwnerOfAnyOrg: boolean;
}

export function DeleteAccountDialog({ children, isOwnerOfAnyOrg }: DeleteAccountDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmedDelete, setConfirmedDelete] = useState(false);
  const router = useRouter();
  const { t } = useTranslation();

  const form = useForm<DeleteAccountData>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: {
      confirmText: '',
      password: '',
    },
  });

  const onSubmit = async (data: DeleteAccountData) => {
    if (!confirmedDelete) {
      toast.error(t('account.danger.confirmRequired'));
      return;
    }

    setIsLoading(true);
    try {
      const result = await deleteAccountAction(data);

      if (result?.data?.success) {
        toast.success(t('account.danger.success'));
        router.push('/auth/signin');
      } else {
        toast.error(result?.data?.message || t('account.danger.errorGeneric'));
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error(error instanceof Error ? error.message : t('account.danger.errorGeneric'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            {t('account.danger.deleteTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('account.danger.deleteDescription')}
          </DialogDescription>
        </DialogHeader>

        {isOwnerOfAnyOrg && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t('account.danger.ownerWarning')}
            </AlertDescription>
          </Alert>
        )}

        {!isOwnerOfAnyOrg && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t('account.danger.confirmMessage')}
            </AlertDescription>
          </Alert>
        )}

        {!isOwnerOfAnyOrg && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="confirmText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('account.danger.confirmText')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('account.danger.confirmTextPlaceholder')}
                        {...field}
                        onChange={(e) => {
                          field.onChange(e.target.value);
                          // Auto-update confirmedDelete based on input
                          if (e.target.value === 'DELETE' && confirmedDelete) {
                            setConfirmedDelete(true);
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('security.password.currentPassword')}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder={t('account.danger.confirmPasswordPlaceholder')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center space-x-2">
                  <Checkbox
                    id="confirm-checkbox"
                    checked={confirmedDelete}
                    onCheckedChange={(checked) => setConfirmedDelete(checked === true)}
                  />
                <label
                  htmlFor="confirm-checkbox"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {t('account.danger.confirmCheckbox')}
                </label>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    form.reset();
                    setConfirmedDelete(false);
                  }}
                  disabled={isLoading}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={isLoading || !confirmedDelete}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLoading ? t('account.danger.deleteButtonLoading') : t('account.danger.deleteButtonConfirm')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}

        {isOwnerOfAnyOrg && (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                form.reset();
                setConfirmedDelete(false);
              }}
            >
              {t('common.close')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

