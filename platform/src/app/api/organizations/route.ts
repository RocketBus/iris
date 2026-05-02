import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';

import { logAuditEvent } from '@/lib/audit-logger';
import { authOptions , createOrganization } from '@/lib/auth';
import { logger } from '@/lib/debug';
import { supabaseAdmin } from '@/lib/supabase';
import { isValidTenantSlug } from '@/lib/tenant-utils';

export async function POST(request: NextRequest) {

  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = (await request.json()) as {
      name?: string;
      slug?: string;
      githubOrgId?: unknown;
      githubOrgLogin?: unknown;
    };
    const { name, slug } = body;
    const githubOrgId =
      typeof body.githubOrgId === 'number' && Number.isFinite(body.githubOrgId)
        ? body.githubOrgId
        : null;
    const githubOrgLogin =
      typeof body.githubOrgLogin === 'string' && body.githubOrgLogin.trim().length > 0
        ? body.githubOrgLogin.trim()
        : null;

    // Validate input
    if (!name || !slug) {
      return NextResponse.json(
        { message: 'Organization name and slug are required' },
        { status: 400 }
      );
    }

    // Validate slug format
    if (!isValidTenantSlug(slug)) {
      return NextResponse.json(
        { message: 'Invalid organization slug format' },
        { status: 400 }
      );
    }

    // An Iris org can mirror at most one GitHub org. If we already
    // have one for this github_org_id, route the user there instead of failing
    // when they're a member; otherwise refuse with a clear message.
    if (githubOrgId !== null) {
      const { data: linked } = await supabaseAdmin
        .from('organizations')
        .select('id, slug, name')
        .eq('github_org_id', githubOrgId)
        .maybeSingle();

      if (linked) {
        const { data: membership } = await supabaseAdmin
          .from('organization_members')
          .select('id')
          .eq('organization_id', linked.id)
          .eq('user_id', session.user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (membership) {
          return NextResponse.json(
            { ...linked, alreadyLinked: true },
            { status: 200 },
          );
        }

        return NextResponse.json(
          {
            message:
              'This GitHub organization is already linked to a Iris workspace you are not a member of. Ask an existing member to invite you.',
            code: 'github_org_taken',
          },
          { status: 409 },
        );
      }
    }

    // Check if slug is already taken
    const { data: existingOrg } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .single();

    if (existingOrg) {
      return NextResponse.json(
        { message: 'Organization slug is already taken' },
        { status: 409 }
      );
    }

    // Create organization
    const organization = await createOrganization(session.user.id, name, slug, {
      githubOrgId,
      githubOrgLogin,
    });

    await logAuditEvent({
      organizationId: organization.id,
      actorId: session.user.id,
      action: 'organization.create',
      targetType: 'organization',
      targetId: organization.id,
      metadata: {
        name,
        slug,
        githubOrgId,
        githubOrgLogin,
      },
      request,
    });

    return NextResponse.json(organization, { status: 201 });
  } catch (error: unknown) {
    logger.error('Organization creation error:', { error: error instanceof Error ? error.message : error });
    
    // Handle unique constraint violation
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return NextResponse.json(
        { message: 'Organization slug is already taken' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {

  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's organizations
    const { data: organizations, error } = await supabaseAdmin
      .from('organization_members')
      .select(`
        role,
        status,
        organizations (
          id,
          name,
          slug,
          plan,
          created_at
        )
      `)
      .eq('user_id', session.user.id)
      .eq('status', 'active');

    if (error) {
      throw error;
    }

    const formattedOrganizations = organizations?.map(member => ({
      ...member.organizations,
      role: member.role,
    })) || [];

    return NextResponse.json(formattedOrganizations);
  } catch (error: unknown) {
    logger.error('Get organizations error:', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
