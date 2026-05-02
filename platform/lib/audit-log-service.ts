import { logError } from '@/lib/debug';
import { supabaseAdmin } from '@/lib/supabase';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

export type AuditLogActor = {
  id: string;
  name: string | null;
  email: string | null;
};

export type AuditLogEntry = {
  id: string;
  organizationId: string;
  actorId: string | null;
  actor: AuditLogActor | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type AuditLogListOptions = {
  page?: number;
  pageSize?: number;
};

type SupabaseAuditLogRecord = {
  id: string;
  organization_id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  users?:
    | {
        id: string;
        name: string | null;
        email: string | null;
      }
    | Array<{
        id: string;
        name: string | null;
        email: string | null;
      }>;
};

export type AuditLogListResponse = {
  logs: AuditLogEntry[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

function normalizeActor(
  record: SupabaseAuditLogRecord,
): AuditLogActor | null {
  const actorData = record.users;
  if (!actorData) {
    return null;
  }

  const actor = Array.isArray(actorData) ? actorData[0] : actorData;

  if (!actor) {
    return null;
  }

  return {
    id: actor.id,
    name: actor.name,
    email: actor.email,
  };
}

export async function fetchAuditLogsForOrganization(
  organizationId: string,
  options: AuditLogListOptions = {},
): Promise<AuditLogListResponse> {
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const pageSize = Math.max(
    1,
    Math.min(MAX_PAGE_SIZE, Math.floor(options.pageSize ?? DEFAULT_PAGE_SIZE)),
  );

  const rangeStart = (page - 1) * pageSize;
  const rangeEnd = rangeStart + pageSize - 1;

  try {
    const { data, error, count } = await supabaseAdmin
      .from('audit_logs')
      .select(
        `
          id,
          organization_id,
          actor_id,
          action,
          target_type,
          target_id,
          metadata,
          ip_address,
          user_agent,
          created_at,
          users:users!audit_logs_actor_id_fkey (
            id,
            name,
            email
          )
        `,
        {
          count: 'exact',
        },
      )
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(rangeStart, rangeEnd);

    if (error) {
      throw error;
    }

    const logs = (data ?? []).map((record) => ({
      id: record.id,
      organizationId: record.organization_id,
      actorId: record.actor_id,
      actor: normalizeActor(record),
      action: record.action,
      targetType: record.target_type,
      targetId: record.target_id,
      metadata: record.metadata ?? {},
      ipAddress: record.ip_address,
      userAgent: record.user_agent,
      createdAt: record.created_at,
    }));

    const total = count ?? logs.length;
    const pageCount = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));

    return {
      logs,
      page,
      pageSize,
      total,
      pageCount,
    };
  } catch (error) {
    logError(error, 'fetchAuditLogsForOrganization');
    throw error;
  }
}

