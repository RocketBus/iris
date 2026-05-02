import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

import { env } from './env';
import { getRolePermissions, type UserRole } from './permissions';
import { supabaseAdmin } from './supabase';

// JWT Configuration
const JWT_SECRET = env.JWT_SECRET || env.NEXTAUTH_SECRET;
const JWT_ISSUER = env.JWT_ISSUER;
const JWT_AUDIENCE = env.JWT_AUDIENCE;
const ACCESS_TOKEN_EXPIRES_IN = '1h';
const REFRESH_TOKEN_EXPIRES_DAYS = 7;

export interface MicroserviceTokenPayload {
  userId: string;
  email: string;
  organizationId: string;
  organizationSlug: string;
  role: UserRole;
  permissions: Array<{ resource: string; action: string }>;
  iat: number;
  exp: number;
}

/**
 * Generate access token (JWT) for microservice authentication
 */
export function generateAccessToken(
  userId: string,
  email: string,
  organizationId: string,
  organizationSlug: string,
  role: UserRole,
  permissions: Array<{ resource: string; action: string }>
): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  const payload: Omit<MicroserviceTokenPayload, 'iat' | 'exp'> = {
    userId,
    email,
    organizationId,
    organizationSlug,
    role,
    permissions,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

/**
 * Verify and decode access token
 */
export function verifyAccessToken(token: string): MicroserviceTokenPayload {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as MicroserviceTokenPayload;

    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error(`Invalid token: ${error.message}`);
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired');
    }
    throw error;
  }
}

/**
 * Generate refresh token and store it in database
 */
export async function generateRefreshToken(userId: string): Promise<string> {
  const token = uuidv4();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

  const { error } = await supabaseAdmin
    .from('refresh_tokens')
    .insert({
      user_id: userId,
      token,
      expires_at: expiresAt.toISOString(),
    });

  if (error) {
    throw new Error(`Failed to create refresh token: ${error.message}`);
  }

  return token;
}

/**
 * Verify refresh token and return user ID if valid
 */
export async function verifyRefreshToken(token: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('refresh_tokens')
    .select('user_id, expires_at, revoked_at')
    .eq('token', token)
    .single();

  if (error || !data) {
    throw new Error('Invalid refresh token');
  }

  if (data.revoked_at) {
    throw new Error('Refresh token has been revoked');
  }

  const expiresAt = new Date(data.expires_at);
  if (expiresAt < new Date()) {
    throw new Error('Refresh token expired');
  }

  return data.user_id;
}

/**
 * Revoke a specific refresh token
 */
export async function revokeRefreshToken(token: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('refresh_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token', token)
    .is('revoked_at', null);

  if (error) {
    throw new Error(`Failed to revoke refresh token: ${error.message}`);
  }
}

/**
 * Revoke all refresh tokens for a user
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('refresh_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('revoked_at', null);

  if (error) {
    throw new Error(`Failed to revoke user tokens: ${error.message}`);
  }
}

/**
 * Get user's organization context for microservice token generation
 */
export async function getUserOrganizationContext(
  userId: string,
  tenantSlug: string
): Promise<{
  organizationId: string;
  organizationSlug: string;
  role: UserRole;
  permissions: Array<{ resource: string; action: string }>;
}> {
  // Get organization by slug
  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('id, slug')
    .eq('slug', tenantSlug)
    .single();

  if (orgError || !org) {
    throw new Error('Organization not found');
  }

  // Get user's membership
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('organization_members')
    .select('role, status')
    .eq('user_id', userId)
    .eq('organization_id', org.id)
    .single();

  if (membershipError || !membership || membership.status !== 'active') {
    throw new Error('User not found in organization');
  }

  const role = membership.role as UserRole;
  const permissions = getRolePermissions(role);

  return {
    organizationId: org.id,
    organizationSlug: org.slug,
    role,
    permissions,
  };
}

