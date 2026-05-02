import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';

import { authOptions, ensureAutoAcceptedDomainMembership } from '@/lib/auth';
import { logger } from '@/lib/debug';
import { supabaseAdmin } from '@/lib/supabase';

type OrganizationMemberRecord = {
  role: string;
  organizations: {
    id: string;
    name: string;
    slug: string;
    plan?: string | null;
    logo_url?: string | null;
  };
};

export async function GET(request: NextRequest) {

  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    await ensureAutoAcceptedDomainMembership(session.user.id, session.user.email);

    logger.info('[get-user-orgs] Fetching organizations for user:', { data: session.user.id });

    // Get user's organizations directly from database
    // First, try to get all fields including logo_url
    type SupabaseError = { message?: string; code?: string } | null;
    let organizations: OrganizationMemberRecord[] | null = null;
    let error: SupabaseError = null;

    const initialResult = await supabaseAdmin
      .from('organization_members')
      .select(`
        role,
        organizations (
          id,
          name,
          slug,
          plan,
          logo_url
        )
      `)
      .eq('user_id', session.user.id)
      .eq('status', 'active');

    organizations = initialResult.data as OrganizationMemberRecord[] | null;
    error = initialResult.error ?? null;

    // If error is due to missing logo_url column, retry without it
    if (error?.message?.includes('logo_url')) {
      logger.warn('[get-user-orgs] logo_url column not found, fetching without it');
      const retryResult = await supabaseAdmin
        .from('organization_members')
        .select(`
          role,
          organizations (
            id,
            name,
            slug,
            plan
          )
        `)
        .eq('user_id', session.user.id)
        .eq('status', 'active');
      
      organizations = retryResult.data as OrganizationMemberRecord[] | null;
      error = retryResult.error ?? null;
    }

    if (error) {
      logger.error('[get-user-orgs] Error fetching organizations:', { error: error instanceof Error ? error.message : error });
      return NextResponse.json(
        { message: 'Failed to fetch organizations', error: error.message },
        { status: 500 }
      );
    }

    logger.info('[get-user-orgs] Found organizations:', { data: organizations?.length || 0 });

    const orgs = organizations?.map((member: OrganizationMemberRecord) => ({
      id: member.organizations.id,
      name: member.organizations.name,
      slug: member.organizations.slug,
      plan: member.organizations.plan,
      logo_url: member.organizations.logo_url || null,
      role: member.role,
    })) || [];

    logger.info('[get-user-orgs] Returning organizations:', { data: orgs.length });

    return NextResponse.json({ organizations: orgs }, { status: 200 });
  } catch (error) {
    logger.error('Error in get-user-orgs:', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

