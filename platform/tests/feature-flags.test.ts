import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveFeatureFlags } from '@/lib/features';

const originalEnv = { ...process.env };
const trackedKeys = [
  'FEATURES__AUDIT_LOG',
  'NEXT_PUBLIC_FEATURES__AUDIT_LOG',
];

describe('feature flag resolution', () => {
  beforeEach(() => {
    trackedKeys.forEach((key) => {
      delete process.env[key];
    });
  });

  afterEach(() => {
    trackedKeys.forEach((key) => {
      const originalValue = originalEnv[key];
      if (typeof originalValue === 'undefined') {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    });
  });

  it('uses config defaults when no overrides are set', () => {
    const flags = resolveFeatureFlags();
    expect(flags.auditLog.enabled).toBe(true);
    expect(flags.auditLog.source).toBe('config');
  });

  it('overrides config using server environment variables', () => {
    process.env.FEATURES__AUDIT_LOG = 'false';

    const flags = resolveFeatureFlags();

    expect(flags.auditLog.enabled).toBe(false);
    expect(flags.auditLog.source).toBe('env');
  });

  it('supports public (client) overrides', () => {
    process.env.NEXT_PUBLIC_FEATURES__AUDIT_LOG = 'disabled';

    const flags = resolveFeatureFlags();

    expect(flags.auditLog.enabled).toBe(false);
    expect(flags.auditLog.source).toBe('env');
  });
});

