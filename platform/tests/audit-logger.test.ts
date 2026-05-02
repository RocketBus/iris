import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spies = vi.hoisted(() => {
  const insertSpy = vi.fn();
  const fromSpy = vi.fn(() => ({
    insert: insertSpy,
  }));

  return { insertSpy, fromSpy };
});

vi.mock('@/lib/features/server', () => ({
  isServerFeatureEnabled: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: spies.fromSpy,
  },
}));

import { logAuditEvent } from '@/lib/audit-logger';
import { isServerFeatureEnabled } from '@/lib/features/server';
import { supabaseAdmin } from '@/lib/supabase';

const mockedFeatureEnabled = vi.mocked(isServerFeatureEnabled);
const mockedFrom = vi.mocked(supabaseAdmin.from);

describe('logAuditEvent', () => {
  beforeEach(() => {
    mockedFeatureEnabled.mockReset();
    spies.fromSpy.mockClear();
    spies.insertSpy.mockClear();
    spies.insertSpy.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    mockedFeatureEnabled.mockReset();
  });

  it('skips logging when audit log feature is disabled', async () => {
    mockedFeatureEnabled.mockReturnValue(false);

    await logAuditEvent({
      organizationId: 'org-123',
      actorId: 'user-1',
      action: 'test.action',
    });

    expect(mockedFrom).not.toHaveBeenCalled();
    expect(spies.insertSpy).not.toHaveBeenCalled();
  });

  it('writes a record when audit log feature is enabled', async () => {
    mockedFeatureEnabled.mockReturnValue(true);

    const headers = new Headers({
      'x-forwarded-for': '203.0.113.42',
      'user-agent': 'Vitest',
    });

    await logAuditEvent({
      organizationId: 'org-123',
      actorId: 'user-1',
      action: 'organization.update',
      targetType: 'organization',
      targetId: 'org-123',
      metadata: { name: 'Acme Inc.' },
      headers,
    });

    expect(mockedFrom).toHaveBeenCalledWith('audit_logs');
    expect(spies.insertSpy).toHaveBeenCalledTimes(1);
    expect(spies.insertSpy.mock.calls[0][0]).toMatchObject({
      organization_id: 'org-123',
      actor_id: 'user-1',
      action: 'organization.update',
      target_type: 'organization',
      target_id: 'org-123',
      metadata: { name: 'Acme Inc.' },
      ip_address: '203.0.113.42',
      user_agent: 'Vitest',
    });
  });
});

