'use client';

import { useState } from 'react';

import { MoreHorizontal, UserMinus, Shield, ShieldCheck, Crown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { TransferOwnershipDialog } from './TransferOwnershipDialog';

import { removeMemberAction, updateMemberRoleAction , TeamMember } from '@/actions/team-actions';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from '@/hooks/useTranslation';
import { getUserAvatarUrl } from '@/lib/avatar';
import { canChangeRoles, canRemoveMembers } from '@/lib/permissions';

interface TeamMemberCardProps {
  member: TeamMember;
  currentUserRole: 'owner' | 'admin' | 'member';
  currentUserId: string;
  organizationId: string;
}

export function TeamMemberCard({ 
  member, 
  currentUserRole, 
  currentUserId,
  organizationId
}: TeamMemberCardProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'owner':
        return 'default';
      case 'admin':
        return 'secondary';
      case 'member':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const handleRoleChange = async (newRole: 'admin' | 'member') => {
    if (newRole === member.role) return;

    setIsLoading(true);
    try {
      const result = await updateMemberRoleAction({
        memberId: member.id,
        role: newRole,
        organizationId,
      });

      if (result?.data?.success) {
        toast.success(t('team.changeRoleDialog.success'));
      } else {
        toast.error(result?.data?.message || t('team.changeRoleDialog.error'));
      }
    } catch (error) {
      console.error('Error updating member role:', error);
      toast.error(error instanceof Error ? error.message : t('team.changeRoleDialog.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveMember = async () => {
    setIsLoading(true);
    try {
      const result = await removeMemberAction({
        memberId: member.id,
        organizationId,
      });

      if (result?.data?.success) {
        toast.success(t('team.removeDialog.success'));
        setShowRemoveDialog(false);
      } else {
        toast.error(result?.data?.message || t('team.removeDialog.error'));
      }
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error(error instanceof Error ? error.message : t('team.removeDialog.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const canChangeRole = canChangeRoles(currentUserRole);
  // Owner cannot remove themselves
  const canRemove = canRemoveMembers(currentUserRole, member.role) && 
                    !(currentUserRole === 'owner' && member.userId === currentUserId);
  
  // Check if transfer ownership option is available
  const canTransferOwnership = currentUserRole === 'owner' && member.role !== 'owner';
  
  // Only show menu if there are any actions available
  const hasActions = canTransferOwnership || (canChangeRole && member.role !== 'owner') || canRemove;

  const joinedLabel = `${t('team.joinedAt')} ${new Date(member.joinedAt).toLocaleDateString(
    'en-US',
    { year: 'numeric', month: '2-digit', day: '2-digit' },
  )}`;

  return (
    <>
      <div className="rounded-lg border p-3 sm:p-4">
        <div className="flex items-start gap-3 sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <Avatar className="h-10 w-10 flex-shrink-0">
              {(() => {
                const avatarUrl = getUserAvatarUrl(member.avatarUrl || null, member.email, 40);
                return avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt={member.name} />
                ) : null;
              })()}
              <AvatarFallback>
                {member.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h4 className="truncate font-medium">{member.name}</h4>
              <p className="truncate text-sm text-muted-foreground">{member.email}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge variant={getRoleBadgeVariant(member.role)} className="text-xs">
                  {t(`roles.${member.role}`)}
                </Badge>
                <Badge variant="default" className="text-xs">
                  {member.status}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <span className="hidden whitespace-nowrap text-sm text-muted-foreground sm:inline">
              {joinedLabel}
            </span>
            {hasActions && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    disabled={isLoading}
                    aria-label={t('team.memberActionsAriaLabel')}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MoreHorizontal className="h-4 w-4" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canTransferOwnership && (
                  <TransferOwnershipDialog member={member} organizationId={organizationId}>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Crown className="mr-2 h-4 w-4" />
                      {t('team.transferOwnership')}
                    </DropdownMenuItem>
                  </TransferOwnershipDialog>
                )}
                {canChangeRole && member.role !== 'owner' && (
                  <>
                    {member.role === 'member' && (
                      <DropdownMenuItem onClick={() => handleRoleChange('admin')}>
                        <Shield className="mr-2 h-4 w-4" />
                        {t('team.changeRoleDialog.changeButton')} {t('roles.admin')}
                      </DropdownMenuItem>
                    )}
                    {member.role === 'admin' && (
                      <DropdownMenuItem onClick={() => handleRoleChange('member')}>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        {t('team.changeRoleDialog.demoteButton')} {t('roles.member')}
                      </DropdownMenuItem>
                    )}
                  </>
                )}
                {canRemove && (
                  <DropdownMenuItem 
                    onClick={() => setShowRemoveDialog(true)}
                    className="text-red-600"
                  >
                    <UserMinus className="mr-2 h-4 w-4" />
                    {t('team.removeMember')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground sm:hidden">
          {joinedLabel}
        </p>
      </div>

      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('team.removeDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('team.removeDialog.description', { name: member.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('team.removeDialog.confirmButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
