import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';
import { v4 as uuidv4 } from 'uuid';

import { logAuditEvent } from '@/lib/audit-logger';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/debug';
import { uploadImageToStorage, deleteFileFromStorage } from '@/lib/storage';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(
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

    const { organizationId } = await params;

    // Get user's membership to verify permissions
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('organization_members')
      .select('role')
      .eq('user_id', session.user.id)
      .eq('organization_id', organizationId)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json(
        { message: 'Organization not found or access denied' },
        { status: 404 }
      );
    }

    // Only owners and admins can upload logos
    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return NextResponse.json(
        { message: 'Only organization owners and admins can upload logos' },
        { status: 403 }
      );
    }

    // Get the file from form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { message: 'No file provided' },
        { status: 400 }
      );
    }

    // Get current logo URL to delete old one if exists
    const { data: currentOrg } = await supabaseAdmin
      .from('organizations')
      .select('logo_url')
      .eq('id', organizationId)
      .single();

    // Upload file
    const fileExtension = file.name.split('.').pop() || 'png';
    const fileName = `${organizationId}/${uuidv4()}.${fileExtension}`;
    const bucket = 'organization-logos';

    const uploadResult = await uploadImageToStorage(bucket, file, fileName);

    if (!uploadResult.success || !uploadResult.url) {
      return NextResponse.json(
        { message: uploadResult.error || 'Failed to upload logo' },
        { status: 500 }
      );
    }

    // Update organization with new logo URL
    const { error: updateError } = await supabaseAdmin
      .from('organizations')
      .update({ logo_url: uploadResult.url })
      .eq('id', organizationId);

    if (updateError) {
      // Try to delete the uploaded file if update failed
      await deleteFileFromStorage(bucket, fileName);
      return NextResponse.json(
        { message: 'Failed to update organization logo' },
        { status: 500 }
      );
    }

    // Delete old logo if it exists and is in our storage
    if (currentOrg?.logo_url && currentOrg.logo_url.includes('/storage/v1/object/public/organization-logos/')) {
      await deleteFileFromStorage(bucket, currentOrg.logo_url);
    }

    await logAuditEvent({
      organizationId,
      actorId: session.user.id,
      action: 'organization.logo.update',
      targetType: 'organization',
      targetId: organizationId,
      metadata: {
        previousLogoUrl: currentOrg?.logo_url ?? null,
        newLogoUrl: uploadResult.url,
        fileName,
      },
      request,
    });

    return NextResponse.json(
      { 
        success: true, 
        message: 'Logo uploaded successfully',
        logoUrl: uploadResult.url 
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Logo upload error:', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

