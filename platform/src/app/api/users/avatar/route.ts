import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';
import { v4 as uuidv4 } from 'uuid';

import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/debug';
import { uploadImageToStorage, deleteFileFromStorage } from '@/lib/storage';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {

  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
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

    // Get current avatar URL to delete old one if exists
    const { data: currentUser } = await supabaseAdmin
      .from('users')
      .select('avatar_url')
      .eq('id', session.user.id)
      .single();

    // Upload file
    const fileExtension = file.name.split('.').pop() || 'png';
    const fileName = `${session.user.id}/${uuidv4()}.${fileExtension}`;
    const bucket = 'user-avatars';

    const uploadResult = await uploadImageToStorage(bucket, file, fileName);

    if (!uploadResult.success || !uploadResult.url) {
      return NextResponse.json(
        { message: uploadResult.error || 'Failed to upload avatar' },
        { status: 500 }
      );
    }

    // Update user with new avatar URL
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ avatar_url: uploadResult.url })
      .eq('id', session.user.id);

    if (updateError) {
      // Try to delete the uploaded file if update failed
      await deleteFileFromStorage(bucket, fileName);
      return NextResponse.json(
        { message: 'Failed to update user avatar' },
        { status: 500 }
      );
    }

    // Delete old avatar if it exists and is in our storage
    if (currentUser?.avatar_url && currentUser.avatar_url.includes('/storage/v1/object/public/user-avatars/')) {
      await deleteFileFromStorage(bucket, currentUser.avatar_url);
    }

    return NextResponse.json(
      { 
        success: true, 
        message: 'Avatar uploaded successfully',
        avatarUrl: uploadResult.url 
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Avatar upload error:', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {

  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get current avatar URL
    const { data: currentUser } = await supabaseAdmin
      .from('users')
      .select('avatar_url')
      .eq('id', session.user.id)
      .single();

    // Update user to remove avatar URL
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ avatar_url: null })
      .eq('id', session.user.id);

    if (updateError) {
      return NextResponse.json(
        { message: 'Failed to remove avatar' },
        { status: 500 }
      );
    }

    // Delete avatar from storage if it exists and is in our storage
    if (currentUser?.avatar_url && currentUser.avatar_url.includes('/storage/v1/object/public/user-avatars/')) {
      await deleteFileFromStorage('user-avatars', currentUser.avatar_url);
    }

    return NextResponse.json(
      { 
        success: true, 
        message: 'Avatar removed successfully'
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Avatar delete error:', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

