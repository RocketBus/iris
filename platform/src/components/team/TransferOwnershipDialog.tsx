'use client';

import { useState } from 'react';

import { Crown, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import { transferOwnershipAction , TeamMember } from '@/actions/team-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTranslation } from '@/hooks/useTranslation';
import { getUserAvatarUrl } from '@/lib/avatar';

interface TransferOwnershipDialogProps {
  member: TeamMember;
  organizationId: string;
  children: React.ReactNode;
}

export function TransferOwnershipDialog({ 
  member, 
  organizationId,
  children 
}: TransferOwnershipDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleTransfer = async () => {
    setIsLoading(true);
    try {
      const result = await transferOwnershipAction({
        newOwnerMemberId: member.id,
        organizationId,
      });

      if (result?.data?.success) {
        toast.success(t('team.transferOwnershipDialog.success'));
        setOpen(false);
        // Force page reload to refresh session with new role
        window.location.reload();
      } else {
        toast.error(result?.data?.message || t('team.transferOwnershipDialog.error'));
      }
    } catch (error) {
      console.error('Error transferring ownership:', error);
      toast.error(error instanceof Error ? error.message : t('team.transferOwnershipDialog.error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <div onClick={(e) => {
        e.preventDefault();
        setOpen(true);
      }}>
        {children}
      </div>
      <AlertDialogContent className="sm:max-w-[500px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-orange-600">
            <Crown className="h-5 w-5" />
            {t('team.transferOwnershipDialog.title')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('team.transferOwnershipDialog.description', { name: member.name, email: member.email })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t('team.transferOwnershipDialog.warning')}
          </AlertDescription>
        </Alert>

        <div className="border rounded-lg p-4 bg-muted/50">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              {(() => {
                const avatarUrl = getUserAvatarUrl(member.avatarUrl || null, member.email, 48);
                return avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt={member.name} />
                ) : null;
              })()}
              <AvatarFallback>
                {member.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h4 className="font-medium">{member.name}</h4>
              <p className="text-sm text-muted-foreground">{member.email}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('team.transferOwnershipDialog.newOwnerLabel')}: {t(`roles.${member.role}`)}
              </p>
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleTransfer}
            disabled={isLoading}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('team.transferOwnershipDialog.transferButton')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

