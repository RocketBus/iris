'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';



import { deleteOrganizationAction } from '@/actions/organization-actions';
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
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/hooks/useTranslation';
import { deleteOrganizationSchema, type DeleteOrganizationData } from '@/lib/form-schema';

interface DeleteOrganizationDialogProps {
  children: React.ReactNode;
  organizationId: string;
  organizationName: string;
}

export function DeleteOrganizationDialog({ 
  children, 
  organizationId,
  organizationName 
}: DeleteOrganizationDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const form = useForm<DeleteOrganizationData>({
    resolver: zodResolver(deleteOrganizationSchema),
    defaultValues: {
      organizationId,
      confirmText: '',
    },
  });

  const onSubmit = async (data: DeleteOrganizationData) => {
    if (data.confirmText !== organizationName) {
      form.setError('confirmText', {
        message: t('settings.deleteOrganizationDialog.error'),
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await deleteOrganizationAction(data);

      if (result?.data?.success) {
        toast.success(t('settings.deleteOrganizationDialog.success'));
        setOpen(false);
        router.push('/');
      } else {
        toast.error(result?.data?.message || t('settings.deleteOrganizationDialog.error'));
      }
    } catch (error) {
      console.error('Error deleting organization:', error);
      toast.error(error instanceof Error ? error.message : t('settings.deleteOrganizationDialog.error'));
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
            {t('settings.deleteOrganizationDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('settings.deleteOrganizationDialog.description', { name: organizationName })}
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t('settings.deleteOrganizationDialog.warning')}
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="confirmText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('settings.deleteOrganizationDialog.confirmLabel', { name: organizationName })}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={organizationName}
                      {...field}
                    />
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
              <Button
                type="submit"
                variant="destructive"
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('settings.deleteOrganizationDialog.confirmButton')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

