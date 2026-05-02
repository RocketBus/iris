"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getServerSession } from "next-auth/next";

import { actionClient } from "./safe-action";

import { logAuditEvent } from "@/lib/audit-logger";
import { authOptions } from "@/lib/auth";
import { debugDatabase, logError } from "@/lib/debug";
import { deleteOrganizationSchema } from "@/lib/form-schema";
import { deleteFileFromStorage } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase";

// Helper function to get user's organization context by organization ID
async function getUserOrganizationContextById(userId: string, organizationId: string) {
  debugDatabase('Getting user organization context by ID', { userId, organizationId });
  
  // Get organization by ID
  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug, logo_url')
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
    organizationSlug: org.slug,
    logoUrl: org.logo_url,
    userRole: membership.role as 'owner' | 'admin' | 'member',
    userStatus: membership.status
  };
}

// Delete organization action
export const deleteOrganizationAction = actionClient
  .inputSchema(deleteOrganizationSchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      const { organizationId, confirmText } = parsedInput;
      
      // Get user's organization context
      const { organizationName, userRole, logoUrl } = await getUserOrganizationContextById(session.user.id, organizationId);
      
      // Only owners can delete organizations
      if (userRole !== 'owner') {
        throw new Error('Only organization owners can delete organizations');
      }

      // Verify confirmation text matches organization name
      if (confirmText !== organizationName) {
        throw new Error('Confirmation text must match the organization name');
      }

      // Delete logo from storage if exists
      if (logoUrl && logoUrl.includes('/storage/v1/object/public/organization-logos/')) {
        await deleteFileFromStorage('organization-logos', logoUrl);
      }

      // Delete organization (cascade will handle members, invitations, etc)
      const { error: deleteError } = await supabaseAdmin
        .from('organizations')
        .delete()
        .eq('id', organizationId);

      if (deleteError) {
        debugDatabase('Failed to delete organization', { error: deleteError });
        throw new Error('Failed to delete organization');
      }

      debugDatabase('Organization deleted successfully', { organizationId, organizationName });

      const requestHeaders = await headers();
      await logAuditEvent({
        organizationId,
        actorId: session.user.id,
        action: 'organization.delete',
        targetType: 'organization',
        targetId: organizationId,
        metadata: {
          organizationName,
        },
        headers: requestHeaders,
      });

      revalidatePath('/[tenant]/settings', 'page');

      return {
        success: true,
        message: 'Organization deleted successfully',
      };
    } catch (error) {
      logError(error, 'deleteOrganizationAction');
      throw error;
    }
  });

