'use client';

import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { changePasswordAction } from '@/actions/profile-actions';
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
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/hooks/useTranslation';
import { changePasswordSchema, type ChangePasswordData } from '@/lib/form-schema';

interface ChangePasswordDialogProps {
  children: React.ReactNode;
}

export function ChangePasswordDialog({ children }: ChangePasswordDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { t } = useTranslation();

  const form = useForm<ChangePasswordData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: ChangePasswordData) => {
    setIsLoading(true);
    try {
      const result = await changePasswordAction(data);

      if (result?.data?.success) {
        toast.success(t('security.password.success'));
        form.reset();
        setOpen(false);
      } else {
        toast.error(result?.data?.message || t('security.password.error'));
      }
    } catch (error) {
      console.error('Error changing password:', error);
      toast.error(error instanceof Error ? error.message : t('security.password.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const currentPassword = form.watch('newPassword');
  const passwordStrength = getPasswordStrength(currentPassword, t);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            {t('security.password.dialogTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('security.password.dialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('security.password.currentPassword')}</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showCurrentPassword ? 'text' : 'password'}
                        placeholder={t('security.password.currentPasswordPlaceholder')}
                        {...field}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      >
                        {showCurrentPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('security.password.newPassword')}</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showNewPassword ? 'text' : 'password'}
                        placeholder={t('security.password.newPasswordPlaceholder')}
                        {...field}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  {currentPassword && (
                    <div className="space-y-1">
                      <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${passwordStrength.color}`}
                          style={{ width: `${passwordStrength.percentage}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {passwordStrength.label}
                      </p>
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('security.password.confirmPassword')}</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder={t('security.password.confirmPasswordPlaceholder')}
                        {...field}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </FormControl>
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
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('security.password.submitButton')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function getPasswordStrength(
  password: string,
  t: (key: string) => string,
): {
  percentage: number;
  label: string;
  color: string;
} {
  if (!password) {
    return { percentage: 0, label: '', color: '' };
  }

  let strength = 0;

  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (/[a-z]/.test(password)) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) strength++;

  if (strength < 3) {
    return {
      percentage: 33,
      label: t('security.password.strengthWeak'),
      color: 'bg-red-500',
    };
  }

  if (strength < 5) {
    return {
      percentage: 66,
      label: t('security.password.strengthMedium'),
      color: 'bg-yellow-500',
    };
  }

  return {
    percentage: 100,
    label: t('security.password.strengthStrong'),
    color: 'bg-green-500',
  };
}

