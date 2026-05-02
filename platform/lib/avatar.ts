import { getGravatarUrl } from './gravatar';

/**
 * Get user avatar URL with fallback priority:
 * 1. Custom avatar_url from database (Supabase Storage)
 * 2. Gravatar URL (if email is registered)
 * 3. null (fallback to initials)
 * 
 * @param avatarUrl - Custom avatar URL from database
 * @param email - User's email for Gravatar fallback
 * @param size - Size of avatar (for Gravatar)
 * @returns Avatar URL or null
 */
export function getUserAvatarUrl(
  avatarUrl: string | null | undefined,
  email: string,
  size: number = 200
): string | null {
  // Priority 1: Custom avatar from Supabase Storage
  if (avatarUrl) {
    return avatarUrl;
  }

  // Priority 2: Gravatar
  if (email) {
    return getGravatarUrl(email, size, 'mp'); // 'mp' = mystery person default, always returns image
  }

  // Priority 3: null (component should show initials)
  return null;
}

