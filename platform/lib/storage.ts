import { debugDatabase, logError } from './debug';
import { supabaseAdmin } from './supabase';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

export interface UploadFileResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Upload an image file to Supabase Storage
 */
export async function uploadImageToStorage(
  bucket: string,
  file: File,
  path: string
): Promise<UploadFileResult> {
  try {
    // Validate file type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return {
        success: false,
        error: `Invalid file type. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
      };
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File size exceeds maximum limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      };
    }

    // Convert File to ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer();

    // Upload to Supabase Storage
    const { error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, arrayBuffer, {
        contentType: file.type,
        upsert: true, // Replace if file already exists
      });

    if (error) {
      debugDatabase('Storage upload error', { error, bucket, path });
      return {
        success: false,
        error: error.message || 'Failed to upload file',
      };
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from(bucket)
      .getPublicUrl(path);

    if (!urlData?.publicUrl) {
      return {
        success: false,
        error: 'Failed to get public URL for uploaded file',
      };
    }

    debugDatabase('File uploaded successfully', { bucket, path, url: urlData.publicUrl });

    return {
      success: true,
      url: urlData.publicUrl,
    };
  } catch (error) {
    logError(error, 'uploadImageToStorage');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Delete a file from Supabase Storage
 */
export async function deleteFileFromStorage(
  bucket: string,
  path: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Extract path from full URL if needed
    const storagePath = path.includes('/storage/v1/object/public/') 
      ? path.split('/storage/v1/object/public/')[1]?.split('/').slice(1).join('/')
      : path;

    const { error } = await supabaseAdmin.storage
      .from(bucket)
      .remove([storagePath]);

    if (error) {
      debugDatabase('Storage delete error', { error, bucket, path: storagePath });
      return {
        success: false,
        error: error.message || 'Failed to delete file',
      };
    }

    debugDatabase('File deleted successfully', { bucket, path: storagePath });

    return { success: true };
  } catch (error) {
    logError(error, 'deleteFileFromStorage');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

