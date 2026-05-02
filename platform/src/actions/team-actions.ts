"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { randomBytes } from "crypto";
import { getServerSession } from "next-auth/next";

import { actionClient } from "./safe-action";

import { logAuditEvent } from "@/lib/audit-logger";
import { authOptions } from "@/lib/auth";
import { debugDatabase, logError } from "@/lib/debug";
import { sendInvitationEmail, sendOwnershipTransferEmail } from "@/lib/email";
import { 
  inviteMemberSchema, 
  updateMemberRoleSchema, 
  removeMemberSchema, 
  transferOwnershipSchema,
  invitationActionSchema,
  acceptInvitationSchema 
} from "@/lib/form-schema";
import { canInviteMembers, canManageMembers, canChangeRoles, canRemoveMembers } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase";

// Types for team data
export interface TeamMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'pending' | 'suspended';
  joinedAt: string;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: 'admin' | 'member';
  token: string;
  expiresAt: string;
  invitedBy: string;
  invitedByName: string;
  createdAt: string;
}

// Helper function to get user's organization and role by organization ID
async function getUserOrganizationContextById(userId: string, organizationId: string) {
  debugDatabase('Getting user organization context by ID', { userId, organizationId });
  
  // Get organization by ID
  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug')
    .eq('id', organizationId)
    .single();

  if (orgError || !org) {
    debugDatabase('Organization not found', { organizationId, error: orgError });
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
    debugDatabase('User membership not found', { userId, orgId: org.id, error: membershipError });
    throw new Error('User not found in organization');
  }

  return {
    organizationId: org.id,
    organizationName: org.name,
    userRole: membership.role as 'owner' | 'admin' | 'member',
    userStatus: membership.status
  };
}

// Invite member action
export const inviteMemberAction = actionClient
  .inputSchema(inviteMemberSchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      const { email, role, organizationId } = parsedInput;
      
      // Get user's organization context
      const { userRole, organizationName } = await getUserOrganizationContextById(session.user.id, organizationId);
      
      // Check permissions
      if (!canInviteMembers(userRole)) {
        throw new Error('Insufficient permissions to invite members');
      }

      // Check if user already exists
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

      // Check if user is already a member
      const { data: existingMember } = await supabaseAdmin
        .from('organization_members')
        .select('id, status')
        .eq('organization_id', organizationId)
        .eq('user_id', existingUser?.id || '')
        .single();

      if (existingMember) {
        if (existingMember.status === 'active') {
          throw new Error('User is already a member of this organization');
        } else if (existingMember.status === 'pending') {
          throw new Error('User already has a pending invitation');
        }
      }

      // Expired invitations hold stale tokens that block the new invite's
      // acceptance flow — purge them before creating a fresh one.
      await supabaseAdmin
        .from('invitations')
        .delete()
        .eq('email', email)
        .eq('organization_id', organizationId)
        .lt('expires_at', new Date().toISOString());

      // Check for existing pending invitation
      const { data: existingInvitation } = await supabaseAdmin
        .from('invitations')
        .select('id')
        .eq('email', email)
        .eq('organization_id', organizationId)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (existingInvitation) {
        throw new Error('User already has a pending invitation');
      }

      // Generate invitation token
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Create invitation record
      const { data: invitation, error: invitationError } = await supabaseAdmin
        .from('invitations')
        .insert({
          email,
          organization_id: organizationId,
          role,
          token,
          expires_at: expiresAt.toISOString(),
          invited_by: session.user.id
        })
        .select()
        .single();

      if (invitationError) {
        debugDatabase('Failed to create invitation', { error: invitationError });
        throw new Error('Failed to create invitation');
      }

      // Send invitation email
      await sendInvitationEmail(email, token, organizationName, session.user.name || 'Someone');

      debugDatabase('Member invitation created successfully', {
        invitationId: invitation.id,
        email,
        role,
        organizationId
      });

      const requestHeaders = await headers();
      await logAuditEvent({
        organizationId,
        actorId: session.user.id,
        action: 'invitation.create',
        targetType: 'invitation',
        targetId: invitation.id,
        metadata: {
          email,
          role,
          expiresAt: invitation.expires_at,
        },
        headers: requestHeaders,
      });

      revalidatePath('/[tenant]/team', 'page');
      
      return {
        success: true,
        message: 'Invitation sent successfully',
        invitationId: invitation.id
      };
    } catch (error) {
      logError(error, 'inviteMemberAction');
      throw error;
    }
  });

// Resend invitation action
export const resendInvitationAction = actionClient
  .inputSchema(invitationActionSchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      const { invitationId, organizationId } = parsedInput;
      
      // Get user's organization context
      const { userRole, organizationName } = await getUserOrganizationContextById(session.user.id, organizationId);
      
      // Check permissions
      if (!canManageMembers(userRole)) {
        throw new Error('Insufficient permissions to resend invitations');
      }

      // Get invitation details
      const { data: invitation, error: invitationError } = await supabaseAdmin
        .from('invitations')
        .select('email, token, expires_at')
        .eq('id', invitationId)
        .eq('organization_id', organizationId)
        .single();

      if (invitationError || !invitation) {
        throw new Error('Invitation not found');
      }

      // If the invite has expired, rotate token and extend expiration so
      // resending actually produces a working link.
      let token = invitation.token;
      if (new Date(invitation.expires_at) < new Date()) {
        token = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const { error: updateError } = await supabaseAdmin
          .from('invitations')
          .update({
            token,
            expires_at: expiresAt.toISOString(),
          })
          .eq('id', invitationId);

        if (updateError) {
          debugDatabase('Failed to rotate expired invitation', { error: updateError });
          throw new Error('Failed to refresh invitation');
        }
      }

      // Resend email
      await sendInvitationEmail(
        invitation.email,
        token,
        organizationName,
        session.user.name || 'Someone'
      );

      debugDatabase('Invitation resent successfully', {
        invitationId,
        email: invitation.email
      });

      const requestHeaders = await headers();
      await logAuditEvent({
        organizationId,
        actorId: session.user.id,
        action: 'invitation.resend',
        targetType: 'invitation',
        targetId: invitationId,
        metadata: {
          email: invitation.email,
        },
        headers: requestHeaders,
      });

      return {
        success: true,
        message: 'Invitation resent successfully'
      };
    } catch (error) {
      logError(error, 'resendInvitationAction');
      throw error;
    }
  });

// Cancel invitation action
export const cancelInvitationAction = actionClient
  .inputSchema(invitationActionSchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      const { invitationId, organizationId } = parsedInput;
      
      // Get user's organization context
      const { userRole } = await getUserOrganizationContextById(session.user.id, organizationId);
      
      // Check permissions
      if (!canManageMembers(userRole)) {
        throw new Error('Insufficient permissions to cancel invitations');
      }

      // Delete invitation
      const { error: deleteError } = await supabaseAdmin
        .from('invitations')
        .delete()
        .eq('id', invitationId)
        .eq('organization_id', organizationId);

      if (deleteError) {
        debugDatabase('Failed to cancel invitation', { error: deleteError });
        throw new Error('Failed to cancel invitation');
      }

      debugDatabase('Invitation cancelled successfully', { invitationId });

      const requestHeaders = await headers();
      await logAuditEvent({
        organizationId,
        actorId: session.user.id,
        action: 'invitation.cancel',
        targetType: 'invitation',
        targetId: invitationId,
        headers: requestHeaders,
      });

      revalidatePath('/[tenant]/team', 'page');
      
      return {
        success: true,
        message: 'Invitation cancelled successfully'
      };
    } catch (error) {
      logError(error, 'cancelInvitationAction');
      throw error;
    }
  });

// Remove member action
export const removeMemberAction = actionClient
  .inputSchema(removeMemberSchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      const { memberId, organizationId } = parsedInput;
      
      // Get user's organization context
      const { userRole } = await getUserOrganizationContextById(session.user.id, organizationId);
      
      // Get member details
      const { data: member, error: memberError } = await supabaseAdmin
        .from('organization_members')
        .select('user_id, role')
        .eq('id', memberId)
        .eq('organization_id', organizationId)
        .single();

      if (memberError || !member) {
        throw new Error('Member not found');
      }

      // Check permissions
      if (!canRemoveMembers(userRole, member.role as 'owner' | 'admin' | 'member')) {
        throw new Error('Insufficient permissions to remove this member');
      }

      // Prevent removing yourself
      if (member.user_id === session.user.id) {
        throw new Error('You cannot remove yourself from the organization');
      }

      // Check if this is the last owner
      if (member.role === 'owner') {
        const { data: ownerCount } = await supabaseAdmin
          .from('organization_members')
          .select('id', { count: 'exact' })
          .eq('organization_id', organizationId)
          .eq('role', 'owner')
          .eq('status', 'active');

        if (ownerCount && ownerCount.length <= 1) {
          throw new Error('Cannot remove the last owner from the organization');
        }
      }

      // Remove member
      const { error: removeError } = await supabaseAdmin
        .from('organization_members')
        .delete()
        .eq('id', memberId)
        .eq('organization_id', organizationId);

      if (removeError) {
        debugDatabase('Failed to remove member', { error: removeError });
        throw new Error('Failed to remove member');
      }

      debugDatabase('Member removed successfully', { memberId, memberRole: member.role });

      const requestHeaders = await headers();
      await logAuditEvent({
        organizationId,
        actorId: session.user.id,
        action: 'member.remove',
        targetType: 'member',
        targetId: memberId,
        metadata: {
          removedUserId: member.user_id,
          removedRole: member.role,
        },
        headers: requestHeaders,
      });

      revalidatePath('/[tenant]/team', 'page');
      
      return {
        success: true,
        message: 'Member removed successfully'
      };
    } catch (error) {
      logError(error, 'removeMemberAction');
      throw error;
    }
  });

// Transfer ownership action
export const transferOwnershipAction = actionClient
  .inputSchema(transferOwnershipSchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      const { newOwnerMemberId, organizationId } = parsedInput;
      
      // Get current user's organization context
      const { userRole: currentUserRole, organizationName } = await getUserOrganizationContextById(session.user.id, organizationId);
      
      // Only owners can transfer ownership
      if (currentUserRole !== 'owner') {
        throw new Error('Only organization owners can transfer ownership');
      }

      // Get new owner member details with user info
      const { data: newOwnerMember, error: newOwnerError } = await supabaseAdmin
        .from('organization_members')
        .select('user_id, role, users!organization_members_user_id_fkey (name, email)')
        .eq('id', newOwnerMemberId)
        .eq('organization_id', organizationId)
        .single();

      if (newOwnerError || !newOwnerMember) {
        throw new Error('Member not found');
      }

      // Cannot transfer to yourself
      if (newOwnerMember.user_id === session.user.id) {
        throw new Error('You are already the owner');
      }

      // Get current owner's name
      const { data: currentOwnerUser } = await supabaseAdmin
        .from('users')
        .select('name')
        .eq('id', session.user.id)
        .single();

      const previousOwnerName = currentOwnerUser?.name || 'The previous owner';
       
      const newOwnerUsers = newOwnerMember.users as { name?: string; email?: string } | null;
      const newOwnerName = newOwnerUsers?.name || 'User';
      const newOwnerEmail = newOwnerUsers?.email;

      // Use a transaction to ensure atomicity
      // Step 1: Demote current owner to admin
      const { error: demoteError } = await supabaseAdmin
        .from('organization_members')
        .update({ role: 'admin' })
        .eq('user_id', session.user.id)
        .eq('organization_id', organizationId)
        .eq('role', 'owner');

      if (demoteError) {
        debugDatabase('Failed to demote current owner', { error: demoteError });
        throw new Error('Failed to transfer ownership');
      }

      // Step 2: Promote new owner
      const { error: promoteError } = await supabaseAdmin
        .from('organization_members')
        .update({ role: 'owner' })
        .eq('id', newOwnerMemberId)
        .eq('organization_id', organizationId);

      if (promoteError) {
        debugDatabase('Failed to promote new owner', { error: promoteError });
        // Rollback: try to restore current owner
        await supabaseAdmin
          .from('organization_members')
          .update({ role: 'owner' })
          .eq('user_id', session.user.id)
          .eq('organization_id', organizationId);
        throw new Error('Failed to transfer ownership');
      }

      debugDatabase('Ownership transferred successfully', { 
        fromUserId: session.user.id, 
        toUserId: newOwnerMember.user_id 
      });

      // Send email notification to new owner
      if (newOwnerEmail) {
        try {
          await sendOwnershipTransferEmail(
            newOwnerEmail,
            organizationName,
            newOwnerName,
            previousOwnerName
          );
        } catch (emailError) {
          // Log email error but don't fail the transaction
          debugDatabase('Failed to send ownership transfer email', { error: emailError });
        }
      }

      const requestHeaders = await headers();
      await logAuditEvent({
        organizationId,
        actorId: session.user.id,
        action: 'organization.transferOwnership',
        targetType: 'organization_member',
        targetId: newOwnerMemberId,
        metadata: {
          previousOwnerId: session.user.id,
          newOwnerId: newOwnerMember.user_id,
        },
        headers: requestHeaders,
      });

      revalidatePath('/[tenant]/team', 'page');
      
      return {
        success: true,
        message: 'Ownership transferred successfully'
      };
    } catch (error) {
      logError(error, 'transferOwnershipAction');
      throw error;
    }
  });

// Update member role action
export const updateMemberRoleAction = actionClient
  .inputSchema(updateMemberRoleSchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      const { memberId, role, organizationId } = parsedInput;
      
      // Get user's organization context
      const { userRole } = await getUserOrganizationContextById(session.user.id, organizationId);
      
      // Check permissions
      if (!canChangeRoles(userRole)) {
        throw new Error('Insufficient permissions to change member roles');
      }

      // Get member details
      const { data: member, error: memberError } = await supabaseAdmin
        .from('organization_members')
        .select('user_id, role')
        .eq('id', memberId)
        .eq('organization_id', organizationId)
        .single();

      if (memberError || !member) {
        throw new Error('Member not found');
      }

      // Prevent changing your own role
      if (member.user_id === session.user.id) {
        throw new Error('You cannot change your own role');
      }

      // Prevent demoting the last owner
      if (member.role === 'owner') {
        const { data: ownerCount } = await supabaseAdmin
          .from('organization_members')
          .select('id', { count: 'exact' })
          .eq('organization_id', organizationId)
          .eq('role', 'owner')
          .eq('status', 'active');

        if (ownerCount && ownerCount.length <= 1) {
          throw new Error('Cannot demote the last owner');
        }
      }

      // Update member role
      const { error: updateError } = await supabaseAdmin
        .from('organization_members')
        .update({ role })
        .eq('id', memberId)
        .eq('organization_id', organizationId);

      if (updateError) {
        debugDatabase('Failed to update member role', { error: updateError });
        throw new Error('Failed to update member role');
      }

      debugDatabase('Member role updated successfully', { 
        memberId, 
        oldRole: member.role, 
        newRole: role 
      });

      const requestHeaders = await headers();
      await logAuditEvent({
        organizationId,
        actorId: session.user.id,
        action: 'member.role.update',
        targetType: 'member',
        targetId: memberId,
        metadata: {
          previousRole: member.role,
          newRole: role,
          updatedUserId: member.user_id,
        },
        headers: requestHeaders,
      });

      revalidatePath('/[tenant]/team', 'page');
      
      return {
        success: true,
        message: 'Member role updated successfully'
      };
    } catch (error) {
      logError(error, 'updateMemberRoleAction');
      throw error;
    }
  });

// Accept invitation action
export const acceptInvitationAction = actionClient
  .inputSchema(acceptInvitationSchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      const { token } = parsedInput;

      // Get invitation details
      const { data: invitation, error: invitationError } = await supabaseAdmin
        .from('invitations')
        .select(`
          id,
          email,
          role,
          organization_id,
          invited_by,
          expires_at,
          organizations!inner (
            id,
            name,
            slug
          )
        `)
        .eq('token', token)
        .single();

      if (invitationError || !invitation) {
        throw new Error('Invalid or expired invitation');
      }

      // Check if invitation is still valid
      if (new Date(invitation.expires_at) < new Date()) {
        throw new Error('Invitation has expired');
      }

      // Check if user email matches invitation email (case-insensitive —
      // mixed case otherwise blocks the accept flow and the invite gets
      // re-issued, leaving an orphan row once the user joins another way).
      if (
        (session.user.email ?? '').toLowerCase() !==
        invitation.email.toLowerCase()
      ) {
        throw new Error('This invitation is not for your email address');
      }

      // Check if user is already a member
      const { data: existingMember } = await supabaseAdmin
        .from('organization_members')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('organization_id', invitation.organization_id)
        .single();

      if (existingMember) {
        throw new Error('You are already a member of this organization');
      }

      // Add user to organization
      const { error: addMemberError } = await supabaseAdmin
        .from('organization_members')
        .insert({
          user_id: session.user.id,
          organization_id: invitation.organization_id,
          role: invitation.role,
          status: 'active',
          invited_by: invitation.invited_by
        });

      if (addMemberError) {
        debugDatabase('Failed to add member to organization', { error: addMemberError });
        throw new Error('Failed to join organization');
      }

      // Delete the invitation
      await supabaseAdmin
        .from('invitations')
        .delete()
        .eq('id', invitation.id);

      debugDatabase('Invitation accepted successfully', {
        userId: session.user.id,
        organizationId: invitation.organization_id,
        role: invitation.role
      });

      const requestHeaders = await headers();
      await logAuditEvent({
        organizationId: invitation.organization_id,
        actorId: session.user.id,
        action: 'invitation.accept',
        targetType: 'invitation',
        targetId: invitation.id,
        metadata: {
          role: invitation.role,
          invitedBy: invitation.invited_by,
        },
        headers: requestHeaders,
      });

      const organization = Array.isArray(invitation.organizations)
        ? invitation.organizations[0]
        : invitation.organizations;

      return {
        success: true,
        message: 'Successfully joined the organization',
        organizationSlug: organization?.slug
      };
    } catch (error) {
      logError(error, 'acceptInvitationAction');
      throw error;
    }
  });
