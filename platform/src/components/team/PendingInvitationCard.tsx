'use client';

import { useState } from 'react';

import { Mail, X, RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { resendInvitationAction, cancelInvitationAction , PendingInvitation } from '@/actions/team-actions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/useTranslation';
import { canResendInvitations, canCancelInvitations } from '@/lib/permissions';

interface PendingInvitationCardProps {
  invitation: PendingInvitation;
  currentUserRole: 'owner' | 'admin' | 'member';
  organizationId: string;
}

export function PendingInvitationCard({ 
  invitation, 
  currentUserRole, 
  organizationId
}: PendingInvitationCardProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
        return 'secondary';
      case 'member':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const formatExpirationDate = (expiresAt: string) => {
    const date = new Date(expiresAt);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) {
      return t('team.invitationCard.expired');
    } else if (diffDays === 1) {
      return t('team.invitationCard.expiresIn', { days: 1 });
    } else {
      return t('team.invitationCard.expiresIn', { days: diffDays });
    }
  };

  const handleResendInvitation = async () => {
    setIsLoading(true);
    try {
      const result = await resendInvitationAction({
        invitationId: invitation.id,
        organizationId,
      });

      if (result?.data?.success) {
        toast.success(t('team.invitationCard.resendSuccess'));
      } else {
        toast.error(result?.data?.message || t('team.invitationCard.resendSuccess'));
      }
    } catch (error) {
      console.error('Error resending invitation:', error);
      toast.error(error instanceof Error ? error.message : t('team.invitationCard.resendSuccess'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelInvitation = async () => {
    setIsLoading(true);
    try {
      const result = await cancelInvitationAction({
        invitationId: invitation.id,
        organizationId,
      });

      if (result?.data?.success) {
        toast.success(t('team.invitationCard.cancelSuccess'));
        setShowCancelDialog(false);
      } else {
        toast.error(result?.data?.message || t('team.invitationCard.cancelSuccess'));
      }
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      toast.error(error instanceof Error ? error.message : t('team.invitationCard.cancelSuccess'));
    } finally {
      setIsLoading(false);
    }
  };

  const canResend = canResendInvitations(currentUserRole);
  const canCancel = canCancelInvitations(currentUserRole);
  const isExpired = new Date(invitation.expiresAt) < new Date();

  const createdLabel = new Date(invitation.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return (
    <>
      <div className="rounded-lg border bg-muted/50 p-3 sm:p-4">
        <div className="flex items-start gap-3 sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-muted">
              <Mail className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <h4 className="truncate font-medium">{invitation.email}</h4>
              <p className="truncate text-sm text-muted-foreground">
                {t('team.invitationCard.invitedBy')} {invitation.invitedByName}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge variant={getRoleBadgeVariant(invitation.role)} className="text-xs">
                  {t(`roles.${invitation.role}`)}
                </Badge>
                <Badge
                  variant={isExpired ? 'destructive' : 'secondary'}
                  className="text-xs"
                >
                  {formatExpirationDate(invitation.expiresAt)}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <span className="hidden whitespace-nowrap text-sm text-muted-foreground sm:inline">
              {createdLabel}
            </span>
            {(canResend || canCancel) && (
              <div className="flex gap-1">
                {canResend && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={handleResendInvitation}
                    disabled={isLoading}
                    title={t('team.invitationCard.resendButton')}
                    aria-label={t('team.invitationCard.resendButton')}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                  </Button>
                )}
                {canCancel && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setShowCancelDialog(true)}
                    disabled={isLoading}
                    title={t('team.invitationCard.cancelButton')}
                    aria-label={t('team.invitationCard.cancelButton')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground sm:hidden">
          {createdLabel}
        </p>
      </div>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('team.invitationCard.cancelDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('team.invitationCard.cancelDialog.description', { email: invitation.email })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelInvitation}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('team.invitationCard.cancelDialog.confirmButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
