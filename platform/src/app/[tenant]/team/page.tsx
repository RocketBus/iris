import { redirect } from 'next/navigation';

import { getServerSession } from 'next-auth/next';

import { InviteMemberDialog } from '@/components/team/InviteMemberDialog';
import { PendingInvitationCard } from '@/components/team/PendingInvitationCard';
import { TeamMemberCard } from '@/components/team/TeamMemberCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authOptions } from '@/lib/auth';
import { canInviteMembers, canManageMembers } from '@/lib/permissions';
import { getServerTranslation } from '@/lib/server-translation';

interface TeamPageProps {
  params: Promise<{
    tenant: string;
  }>;
}

export default async function TeamPage({ params }: TeamPageProps) {
  const session = await getServerSession(authOptions);
  const { t } = await getServerTranslation();

  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  // Await params before using
  const { tenant } = await params;

  // Get user's organization context
  const { userRole, organizationId } = await getUserOrganizationContext(session.user.id, tenant);
  
  // Check permissions
  if (!canManageMembers(userRole)) {
    redirect(`/${tenant}/dashboard`);
  }

  // Fetch team data directly
  const { supabaseAdmin } = await import('@/lib/supabase');
  const { debugDatabase } = await import('@/lib/debug');
  
  // Get team members with user details
  const { data: membersData, error: membersError } = await supabaseAdmin
    .from('organization_members')
    .select(`
      id,
      user_id,
      role,
      status,
      created_at,
      users!organization_members_user_id_fkey (
        name,
        email,
        avatar_url
      )
    `)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (membersError) {
    debugDatabase('Failed to fetch team members', { error: membersError });
  }

  type MemberRecord = {
    id: string;
    user_id: string;
    role: string;
    status: string;
    created_at: string;
    users:
      | {
          name: string | null;
          email: string;
          avatar_url: string | null;
        }
      | Array<{
          name: string | null;
          email: string;
          avatar_url: string | null;
        }>;
  };

  const memberRecords = (membersData ?? []) as MemberRecord[];

  const members = memberRecords.map(member => {
    const user = Array.isArray(member.users) ? member.users[0] : member.users;

    return {
      id: member.id,
      userId: member.user_id,
      name: user?.name || 'Unknown',
      email: user?.email || '',
      avatarUrl: user?.avatar_url || null,
      role: member.role as 'owner' | 'admin' | 'member',
      status: member.status as 'active' | 'pending' | 'suspended',
      joinedAt: member.created_at,
    };
  });

  // Get pending invitations — include recently expired so admins can see
  // and re-send them instead of getting stuck in a silent "limbo" state.
  const recentlyExpiredCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: invitationsData, error: invitationsError } = await supabaseAdmin
    .from('invitations')
    .select(`
      id,
      email,
      role,
      token,
      expires_at,
      created_at,
      invited_by,
      users!invitations_invited_by_fkey (
        name
      )
    `)
    .eq('organization_id', organizationId)
    .gt('expires_at', recentlyExpiredCutoff)
    .order('created_at', { ascending: false });

  if (invitationsError) {
    debugDatabase('Failed to fetch pending invitations', { error: invitationsError });
  }

  type InvitationRecord = {
    id: string;
    email: string;
    role: string;
    token: string;
    expires_at: string;
    invited_by: string;
    created_at: string;
    users:
      | { name: string | null }
      | Array<{ name: string | null }>;
  };

  const invitationRecords = (invitationsData ?? []) as InvitationRecord[];

  // Defensive filter against phantom invites — an email that is already an
  // active member should never show up as pending, regardless of how the
  // membership was created (auto-accept domain, manual insert, etc).
  const activeMemberEmails = new Set(
    members.map((member) => member.email.toLowerCase()).filter(Boolean)
  );

  const invitations = invitationRecords
    .filter((invitation) => !activeMemberEmails.has(invitation.email.toLowerCase()))
    .map(invitation => {
      const inviter = Array.isArray(invitation.users) ? invitation.users[0] : invitation.users;

      return {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role as 'admin' | 'member',
        token: invitation.token,
        expiresAt: invitation.expires_at,
        invitedBy: invitation.invited_by,
        invitedByName: inviter?.name || 'Unknown',
        createdAt: invitation.created_at,
      };
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-3xl">{t('team.title')}</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {t('team.subtitle')}
          </p>
        </div>
        {canInviteMembers(userRole) && (
          <InviteMemberDialog
            organizationId={organizationId}
          />
        )}
      </div>

      {/* Active Members */}
      <Card>
        <CardHeader>
          <CardTitle>{t('team.members')}</CardTitle>
          <CardDescription>
            {members.length}{' '}
            {members.length === 1 ? t('team.memberLabel') : t('team.membersLabel')} in your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          {members.length > 0 ? (
            <div className="space-y-4">
              {members.map((member) => (
                <TeamMemberCard
                  key={member.id}
                  member={member}
                  currentUserRole={userRole}
                  currentUserId={session.user.id}
                  organizationId={organizationId}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>{t('team.noMembers')}</p>
              {canInviteMembers(userRole) && (
                <p className="text-sm">{t('team.inviteFirstMember')}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('team.pendingInvitations')}</CardTitle>
            <CardDescription>
            {invitations.length} pending{' '}
            {invitations.length === 1 ? t('team.invitationLabel') : t('team.invitationsLabel')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {invitations.map((invitation) => (
                <PendingInvitationCard
                  key={invitation.id}
                  invitation={invitation}
                  currentUserRole={userRole}
                  organizationId={organizationId}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Helper function to get user's organization context
async function getUserOrganizationContext(userId: string, tenant: string) {
  const { supabaseAdmin } = await import('@/lib/supabase');
  
  // Get organization by slug
  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug')
    .eq('slug', tenant)
    .single();

  if (orgError || !org) {
    throw new Error('Organization not found');
  }

  // Get user's membership
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('organization_members')
    .select('role, status')
    .eq('user_id', userId)
    .eq('organization_id', org.id)
    .single();

  if (membershipError || !membership) {
    throw new Error('User not found in organization');
  }

  return {
    organizationId: org.id,
    organizationName: org.name,
    userRole: membership.role as 'owner' | 'admin' | 'member',
    userStatus: membership.status
  };
}
