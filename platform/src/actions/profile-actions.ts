"use server";

import { revalidatePath } from "next/cache";

import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth/next";

import { actionClient } from "./safe-action";

import { authOptions } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { debugDatabase, logError } from "@/lib/debug";
import {
  updateProfileSchema,
  changePasswordSchema,
  updatePreferencesSchema,
  enable2FASchema,
  disable2FASchema,
  deleteAccountSchema,
} from "@/lib/form-schema";
import { supabaseAdmin } from "@/lib/supabase";

// Update profile action
export const updateProfileAction = actionClient
  .inputSchema(updateProfileSchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      const { name } = parsedInput;

      // Update user name
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ name })
        .eq('id', session.user.id);

      if (updateError) {
        debugDatabase('Failed to update profile', { error: updateError });
        throw new Error('Failed to update profile');
      }

      debugDatabase('Profile updated successfully', { userId: session.user.id });

      revalidatePath('/[tenant]/profile', 'page');

      return {
        success: true,
        message: 'Profile updated successfully',
      };
    } catch (error) {
      logError(error, 'updateProfileAction');
      throw error;
    }
  });

// Change password action
export const changePasswordAction = actionClient
  .inputSchema(changePasswordSchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      const { currentPassword, newPassword } = parsedInput;

      // Get user from database
      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select('password_hash')
        .eq('id', session.user.id)
        .single();

      if (userError || !user) {
        throw new Error('User not found');
      }

      // Verify current password
      if (!user.password_hash) {
        throw new Error('No password set for this account');
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);

      if (!isPasswordValid) {
        throw new Error('Current password is incorrect');
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 12);

      // Update password
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ password_hash: newPasswordHash })
        .eq('id', session.user.id);

      if (updateError) {
        debugDatabase('Failed to update password', { error: updateError });
        throw new Error('Failed to update password');
      }

      debugDatabase('Password updated successfully', { userId: session.user.id });

      return {
        success: true,
        message: 'Password changed successfully',
      };
    } catch (error) {
      logError(error, 'changePasswordAction');
      throw error;
    }
  });

// Update preferences action
export const updatePreferencesAction = actionClient
  .inputSchema(updatePreferencesSchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      const { language, theme } = parsedInput;

      // Update preferences
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          preferences: { language, theme },
          theme_preference: theme,
        })
        .eq('id', session.user.id);

      if (updateError) {
        debugDatabase('Failed to update preferences', { error: updateError });
        throw new Error('Failed to update preferences');
      }

      debugDatabase('Preferences updated successfully', { userId: session.user.id, language, theme });

      revalidatePath('/[tenant]/profile', 'page');

      return {
        success: true,
        message: 'Preferences updated successfully',
      };
    } catch (error) {
      logError(error, 'updatePreferencesAction');
      throw error;
    }
  });

// Mark the welcome guide as dismissed (merges into JSONB preferences without
// clobbering language/theme).
export const dismissWelcomeAction = actionClient.action(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('preferences')
    .eq('id', session.user.id)
    .single();

  const next = {
    ...(existing?.preferences ?? {}),
    welcome_dismissed: true,
  };

  const { error } = await supabaseAdmin
    .from('users')
    .update({ preferences: next })
    .eq('id', session.user.id);

  if (error) {
    debugDatabase('Failed to dismiss welcome guide', { error });
    throw new Error('Failed to dismiss welcome guide');
  }

  return { success: true };
});

// Generate MFA secret (TOTP)
export const generateMFASecretAction = actionClient
  .action(async () => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id || !session?.user?.email) {
        throw new Error('Unauthorized');
      }

      // Import TOTP functions
      const { generateTOTPSecret, generateTOTPQRCode, generateBackupCodes } = await import('@/lib/two-factor');

      // Generate TOTP secret
      const { secret, otpauthUrl } = generateTOTPSecret(
        session.user.email,
        APP_NAME
      );

      // Generate QR code
      const qrCodeUrl = await generateTOTPQRCode(otpauthUrl);

      // Generate backup codes
      const backupCodes = generateBackupCodes();

      debugDatabase('MFA secret generated', { userId: session.user.id });

      return {
        success: true,
        data: {
          secret,
          qrCodeUrl,
          backupCodes,
        },
      };
    } catch (error) {
      logError(error, 'generateMFASecretAction');
      throw error;
    }
  });

// Verify and enable MFA (TOTP)
export const verifyAndEnableMFAAction = actionClient
  .inputSchema(enable2FASchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      // Use the secret passed from the frontend
      const { verifyTOTPCode, generateBackupCodes } = await import('@/lib/two-factor');
      
      const secret = parsedInput.secret;

      // Verify TOTP code
      const isValid = verifyTOTPCode(secret, parsedInput.verificationCode);
      
      if (!isValid) {
        throw new Error('Invalid verification code');
      }

      // Generate backup codes
      const backupCodes = generateBackupCodes();

      // Enable MFA
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          mfa_enabled: true,
          mfa_secret: secret,
          mfa_backup_codes: backupCodes,
        })
        .eq('id', session.user.id);

      if (updateError) {
        debugDatabase('Failed to enable MFA', { error: updateError });
        throw new Error('Failed to enable MFA');
      }

      debugDatabase('MFA enabled successfully', { userId: session.user.id });

      revalidatePath('/[tenant]/profile', 'page');

      return {
        success: true,
        message: '2FA enabled successfully',
        data: {
          backupCodes,
        },
      };
    } catch (error) {
      logError(error, 'verifyAndEnableMFAAction');
      throw error;
    }
  });

// Disable MFA action
export const disableMFAAction = actionClient
  .inputSchema(disable2FASchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      const { password } = parsedInput;

      // Get user from database
      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select('password_hash')
        .eq('id', session.user.id)
        .single();

      if (userError || !user) {
        throw new Error('User not found');
      }

      // Verify password
      if (!user.password_hash) {
        throw new Error('No password set for this account');
      }

      const isPasswordValid = await bcrypt.compare(password, user.password_hash);

      if (!isPasswordValid) {
        throw new Error('Password is incorrect');
      }

      // Disable MFA
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          mfa_enabled: false,
          mfa_secret: null,
          mfa_backup_codes: null,
        })
        .eq('id', session.user.id);

      if (updateError) {
        debugDatabase('Failed to disable MFA', { error: updateError });
        throw new Error('Failed to disable MFA');
      }

      debugDatabase('MFA disabled successfully', { userId: session.user.id });

      revalidatePath('/[tenant]/profile', 'page');

      return {
        success: true,
        message: '2FA disabled successfully',
      };
    } catch (error) {
      logError(error, 'disableMFAAction');
      throw error;
    }
  });

// Delete account action
export const deleteAccountAction = actionClient
  .inputSchema(deleteAccountSchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      const { password } = parsedInput;

      // Get user from database
      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select('password_hash')
        .eq('id', session.user.id)
        .single();

      if (userError || !user) {
        throw new Error('User not found');
      }

      // Verify password
      if (!user.password_hash) {
        throw new Error('No password set for this account');
      }

      const isPasswordValid = await bcrypt.compare(password, user.password_hash);

      if (!isPasswordValid) {
        throw new Error('Password is incorrect');
      }

      // Check if user is owner of any organization
      const { data: ownerMemberships, error: ownerError } = await supabaseAdmin
        .from('organization_members')
        .select('id, role')
        .eq('user_id', session.user.id)
        .eq('role', 'owner')
        .eq('status', 'active');

      if (ownerError) {
        debugDatabase('Failed to check owner status', { error: ownerError });
        throw new Error('Failed to verify organization ownership');
      }

      if (ownerMemberships && ownerMemberships.length > 0) {
        throw new Error('You cannot delete your account while you are an owner of one or more organizations. Please transfer ownership to another member first.');
      }

      // Delete user (cascade will handle related records)
      const { error: deleteError } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('id', session.user.id);

      if (deleteError) {
        debugDatabase('Failed to delete account', { error: deleteError });
        throw new Error('Failed to delete account');
      }

      debugDatabase('Account deleted successfully', { userId: session.user.id });

      return {
        success: true,
        message: 'Account deleted successfully',
      };
    } catch (error) {
      logError(error, 'deleteAccountAction');
      throw error;
    }
  });

// Get user profile data
export const getUserProfileAction = actionClient
  .action(async () => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      // Get user data with preferences
      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select('name, email, email_verified, created_at, last_login_at, preferences, theme_preference, mfa_enabled, avatar_url')
        .eq('id', session.user.id)
        .single();

      if (userError || !user) {
        throw new Error('User not found');
      }

      // Get organization count
      const { data: organizations } = await supabaseAdmin
        .from('organization_members')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('status', 'active');

      // Get owner count
      const { data: ownerMemberships } = await supabaseAdmin
        .from('organization_members')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('role', 'owner')
        .eq('status', 'active');

      return {
        success: true,
        data: {
          name: user.name,
          email: user.email,
          emailVerified: user.email_verified,
          accountCreated: user.created_at,
          lastLogin: user.last_login_at,
          preferences: user.preferences || { language: 'pt-BR', theme: 'system' },
          themePreference: user.theme_preference || 'system',
          mfaEnabled: user.mfa_enabled || false,
          avatarUrl: user.avatar_url || null,
          organizationCount: organizations?.length || 0,
          isOwnerOfAnyOrg: (ownerMemberships?.length || 0) > 0,
        },
      };
    } catch (error) {
      logError(error, 'getUserProfileAction');
      throw error;
    }
  });

