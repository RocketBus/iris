'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { deleteRepositoryAction } from '@/actions/repository-actions';
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
import { deleteRepositorySchema, type DeleteRepositoryData } from '@/lib/form-schema';

interface DeleteRepositoryDialogProps {
  children: React.ReactNode;
  repositoryId: string;
  repositoryName: string;
  organizationId: string;
}

export function DeleteRepositoryDialog({
  children,
  repositoryId,
  repositoryName,
  organizationId,
}: DeleteRepositoryDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const form = useForm<DeleteRepositoryData>({
    resolver: zodResolver(deleteRepositorySchema),
    defaultValues: {
      repositoryId,
      organizationId,
      confirmText: '',
    },
  });

  const onSubmit = async (data: DeleteRepositoryData) => {
    if (data.confirmText !== repositoryName) {
      form.setError('confirmText', {
        message: t('repos.deleteDialog.mismatch'),
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await deleteRepositoryAction(data);

      if (result?.data?.success) {
        toast.success(t('repos.deleteDialog.success'));
        setOpen(false);
        form.reset();
        router.refresh();
      } else {
        toast.error(result?.data?.message || t('repos.deleteDialog.error'));
      }
    } catch (error) {
      console.error('Error deleting repository:', error);
      toast.error(error instanceof Error ? error.message : t('repos.deleteDialog.error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            {t('repos.deleteDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('repos.deleteDialog.description', { name: repositoryName })}
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t('repos.deleteDialog.warning')}</AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="confirmText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('repos.deleteDialog.confirmLabel', { name: repositoryName })}
                  </FormLabel>
                  <FormControl>
                    <Input placeholder={repositoryName} {...field} />
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
              <Button type="submit" variant="destructive" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('repos.deleteDialog.confirmButton')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
