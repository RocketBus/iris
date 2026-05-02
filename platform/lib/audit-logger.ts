import type { NextRequest } from 'next/server';

import { logError } from '@/lib/debug';
import { isServerFeatureEnabled } from '@/lib/features/server';
import { supabaseAdmin } from '@/lib/supabase';

export type AuditLogMetadata = Record<string, unknown>;

export type AuditLogParams = {
  organizationId: string;
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: AuditLogMetadata;
  request?: NextRequest | null;
  headers?: Headers | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function extractRequestContext(
  request?: NextRequest | null,
  fallbackHeaders?: Headers | null,
) {
  const headerBag = request?.headers ?? fallbackHeaders ?? null;

  if (!request && !headerBag) {
    return {
      ipAddress: null,
      userAgent: null,
    };
  }

  const forwardedFor = headerBag?.get('x-forwarded-for');
  const remoteAddress =
    forwardedFor?.split(',')[0]?.trim() ??
    headerBag?.get('x-real-ip') ??
    null;
  const userAgent = headerBag?.get('user-agent');

  return {
    ipAddress: remoteAddress,
    userAgent: userAgent ?? null,
  };
}

export async function logAuditEvent(params: AuditLogParams) {
  if (!isServerFeatureEnabled('auditLog')) {
    return;
  }

  try {
    const {
      organizationId,
      actorId = null,
      action,
      targetType = null,
      targetId = null,
      metadata = {},
      request = null,
      headers = null,
      ipAddress,
      userAgent,
    } = params;

    if (!organizationId || !action) {
      throw new Error('auditLog: organizationId and action are required');
    }

    const requestContext = extractRequestContext(request, headers);

    const payload = {
      organization_id: organizationId,
      actor_id: actorId,
      action,
      target_type: targetType,
      target_id: targetId,
      metadata,
      ip_address: ipAddress ?? requestContext.ipAddress,
      user_agent: userAgent ?? requestContext.userAgent,
    };

    const { error } = await supabaseAdmin
      .from('audit_logs')
      .insert(payload);

    if (error) {
      throw error;
    }
  } catch (error) {
    logError(error, 'auditLog');
  }
}


