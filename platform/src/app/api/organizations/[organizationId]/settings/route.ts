import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/debug';
import { getEmailDomain, isPersonalEmailDomain, normalizeEmailDomain } from '@/lib/email-domain';
import { canManageMembers } from '@/lib/permissions';
import { supabaseAdmin } from '@/lib/supabase';

type OrganizationSettings = {
  autoAcceptDomainMembers?: {
    enabled: boolean;
    domain: string | null;
  };
   
  [key: string]: any;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> }
) {

  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();

    if (typeof body?.autoAcceptDomainMembers !== 'boolean') {
      return NextResponse.json(
        { message: 'autoAcceptDomainMembers flag is required' },
        { status: 400 }
      );
    }

    const { organizationId } = await params;

    const { data: organization, error: organizationError } = await supabaseAdmin
      .from('organizations')
      .select('id, settings')
      .eq('id', organizationId)
      .single();

    if (organizationError || !organization) {
      return NextResponse.json(
        { message: 'Organization not found' },
        { status: 404 }
      );
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('organization_members')
      .select('role, status')
      .eq('user_id', session.user.id)
      .eq('organization_id', organizationId)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json(
        { message: 'You are not a member of this organization' },
        { status: 403 }
      );
    }

    if (!canManageMembers(membership.role)) {
      return NextResponse.json(
        { message: 'You do not have permission to update organization settings' },
        { status: 403 }
      );
    }

    const currentSettings: OrganizationSettings = organization.settings || {};
    const currentAutoSettings = currentSettings.autoAcceptDomainMembers ?? {
      enabled: false,
      domain: null,
    };

    let updatedAutoSettings = currentAutoSettings;

    if (body.autoAcceptDomainMembers) {
      const domain = getEmailDomain(session.user.email);

      if (!domain) {
        return NextResponse.json(
          { message: 'A valid email domain is required to enable this feature' },
          { status: 400 }
        );
      }

      if (isPersonalEmailDomain(domain)) {
        return NextResponse.json(
          { message: 'Personal email domains cannot enable automatic membership approval' },
          { status: 400 }
        );
      }

      updatedAutoSettings = {
        enabled: true,
        domain: normalizeEmailDomain(domain),
      };
    } else {
      updatedAutoSettings = {
        ...currentAutoSettings,
        enabled: false,
      };
    }

    const updatedSettings: OrganizationSettings = {
      ...currentSettings,
      autoAcceptDomainMembers: updatedAutoSettings,
    };

    const { error: updateError } = await supabaseAdmin
      .from('organizations')
      .update({
        settings: updatedSettings,
      })
      .eq('id', organizationId);

    if (updateError) {
      return NextResponse.json(
        { message: 'Failed to update organization settings' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { settings: updatedAutoSettings },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Error updating organization settings:', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}


