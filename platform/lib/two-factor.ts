import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import speakeasy from 'speakeasy';

import { logger } from './debug';
import { supabaseAdmin } from './supabase';

export function generate2FACode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function store2FACode(userId: string, code: string) {
  // Store in database with 10-minute expiration
  await supabaseAdmin
    .from('two_factor_codes')
    .insert({
      user_id: userId,
      code: await bcrypt.hash(code, 10),
      expires_at: new Date(Date.now() + 10 * 60 * 1000)
    });
}

export async function verify2FACode(userId: string, code: string): Promise<boolean> {
  try {
    const { data: storedCode, error } = await supabaseAdmin
      .from('two_factor_codes')
      .select('code, expires_at, used')
      .eq('user_id', userId)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !storedCode) {
      return false;
    }

    const isValid = await bcrypt.compare(code, storedCode.code);
    
    if (isValid) {
      // Mark code as used
      await supabaseAdmin
        .from('two_factor_codes')
        .update({ used: true })
        .eq('user_id', userId)
        .eq('code', storedCode.code);
    }

    return isValid;
  } catch (error) {
    logger.error('2FA verification error', { error });
    return false;
  }
}

export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    codes.push(Math.random().toString(36).substring(2, 8).toUpperCase());
  }
  return codes;
}

/**
 * Generate a TOTP secret for 2FA setup
 */
export function generateTOTPSecret(email: string, appName: string = 'Iris'): {
  secret: string;
  otpauthUrl: string;
} {
  const secret = speakeasy.generateSecret({
    name: `${appName} (${email})`,
    issuer: appName,
    length: 32,
  });

  return {
    secret: secret.base32 || secret.hex || '',
    otpauthUrl: secret.otpauth_url || '',
  };
}

/**
 * Generate QR code data URL for TOTP setup
 */
export async function generateTOTPQRCode(otpauthUrl: string): Promise<string> {
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    return qrCodeDataUrl;
  } catch (error) {
    logger.error('Error generating QR code', { error });
    throw new Error('Failed to generate QR code');
  }
}

/**
 * Verify a TOTP code against a secret
 */
export function verifyTOTPCode(secret: string, code: string, window: number = 2): boolean {
  try {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window, // Allow codes within ±2 time windows (60 seconds total)
    });
  } catch (error) {
    logger.error('Error verifying TOTP code', { error });
    return false;
  }
}

/**
 * Verify a backup code against user's stored backup codes
 */
export async function verifyBackupCode(userId: string, code: string): Promise<boolean> {
  try {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('mfa_backup_codes')
      .eq('id', userId)
      .single();

    if (error || !user || !user.mfa_backup_codes) {
      return false;
    }

    const backupCodes = user.mfa_backup_codes as string[];
    const codeIndex = backupCodes.indexOf(code.toUpperCase());

    if (codeIndex === -1) {
      return false;
    }

    // Remove used backup code
    const updatedCodes = backupCodes.filter((_, index) => index !== codeIndex);
    await supabaseAdmin
      .from('users')
      .update({ mfa_backup_codes: updatedCodes })
      .eq('id', userId);

    return true;
  } catch (error) {
    logger.error('Error verifying backup code', { error });
    return false;
  }
}
