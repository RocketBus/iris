/* eslint-disable import/order */
import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/features/server', () => ({
  isServerFeatureEnabled: vi.fn(),
}));

vi.mock('@/lib/microservice-auth', () => ({
  getUserOrganizationContext: vi.fn(),
}));

vi.mock('@/lib/audit-log-service', () => ({
  fetchAuditLogsForOrganization: vi.fn(),
}));

import type { NextRequest } from 'next/server';

import { GET } from '@/app/api/tenants/[tenant]/audit-logs/route';
import { fetchAuditLogsForOrganization } from '@/lib/audit-log-service';
import { isServerFeatureEnabled } from '@/lib/features/server';
import { getUserOrganizationContext } from '@/lib/microservice-auth';

import { getServerSession } from 'next-auth/next';

const mockedSession = vi.mocked(getServerSession);
const mockedFeature = vi.mocked(isServerFeatureEnabled);
const mockedContext = vi.mocked(getUserOrganizationContext);
const mockedFetchLogs = vi.mocked(fetchAuditLogsForOrganization);

function createRequest(url: string): NextRequest {
  return {
    url,
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockedSession.mockReset();
  mockedFeature.mockReset();
  mockedContext.mockReset();
  mockedFetchLogs.mockReset();
});

describe('GET /api/tenants/[tenant]/audit-logs', () => {
  it('returns 404 when audit log feature is disabled', async () => {
    mockedFeature.mockReturnValue(false);

    const response = await GET(createRequest('http://example.com'), {
      params: Promise.resolve({ tenant: 'acme' }),
    });

    expect(response.status).toBe(404);
  });

  it('returns 403 for members without privileged role', async () => {
    mockedFeature.mockReturnValue(true);
    mockedSession.mockResolvedValue({
      user: { id: 'user-1' },
    } as never);
    mockedContext.mockResolvedValue({
      organizationId: 'org-1',
      organizationSlug: 'acme',
      role: 'member',
      permissions: [],
    });

    const response = await GET(createRequest('http://example.com'), {
      params: Promise.resolve({ tenant: 'acme' }),
    });

    expect(response.status).toBe(403);
  });

  it('returns audit log data for owners/admins', async () => {
    mockedFeature.mockReturnValue(true);
    mockedSession.mockResolvedValue({
      user: { id: 'user-1' },
    } as never);
    mockedContext.mockResolvedValue({
      organizationId: 'org-1',
      organizationSlug: 'acme',
      role: 'owner',
      permissions: [],
    });
    mockedFetchLogs.mockResolvedValue({
      logs: [],
      page: 1,
      pageSize: 25,
      total: 0,
      pageCount: 1,
    });

    const response = await GET(
      createRequest(
        'http://example.com/api/tenants/acme/audit-logs?page=2&pageSize=5',
      ),
      { params: Promise.resolve({ tenant: 'acme' }) },
    );

    expect(mockedFetchLogs).toHaveBeenCalledWith('org-1', {
      page: 2,
      pageSize: 5,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      logs: [],
      page: 1,
      pageSize: 25,
      total: 0,
      pageCount: 1,
    });
  });
});

