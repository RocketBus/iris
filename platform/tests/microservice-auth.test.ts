import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret-key-for-testing-min-32-chars';
  process.env.JWT_ISSUER = 'test-issuer';
  process.env.JWT_AUDIENCE = 'test-audience';
});

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: {
              user_id: 'user_123',
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              revoked_at: null,
            },
            error: null,
          }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn().mockResolvedValue({ error: null }),
        })),
      })),
    })),
  },
}));

import {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
} from '@/lib/microservice-auth';

describe('generateAccessToken', () => {
  it('generates a valid JWT string', () => {
    const token = generateAccessToken(
      'user_123',
      'test@test.com',
      'org_123',
      'test-org',
      'admin',
      [{ resource: 'organization', action: 'read' }]
    );
    expect(token).toBeTruthy();
    expect(token.split('.').length).toBe(3); // JWT has 3 parts
  });

  it('includes correct payload', () => {
    const token = generateAccessToken(
      'user_123',
      'test@test.com',
      'org_123',
      'test-org',
      'owner',
      [{ resource: 'users', action: 'delete' }]
    );

    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe('user_123');
    expect(decoded.email).toBe('test@test.com');
    expect(decoded.organizationId).toBe('org_123');
    expect(decoded.organizationSlug).toBe('test-org');
    expect(decoded.role).toBe('owner');
    expect(decoded.permissions).toEqual([{ resource: 'users', action: 'delete' }]);
  });
});

describe('verifyAccessToken', () => {
  it('decodes a valid token', () => {
    const token = generateAccessToken(
      'user_1',
      'a@b.com',
      'org_1',
      'slug',
      'member',
      []
    );
    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe('user_1');
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp).toBeDefined();
  });

  it('throws on invalid token', () => {
    expect(() => verifyAccessToken('invalid.token.here')).toThrow('Invalid token');
  });

  it('throws on expired token', async () => {
    // Create a token with very short expiry by mocking jwt.sign
    const jwt = await import('jsonwebtoken');
    const expiredToken = jwt.default.sign(
      { userId: 'u', email: 'e', organizationId: 'o', organizationSlug: 's', role: 'member', permissions: [] },
      process.env.JWT_SECRET!,
      { expiresIn: '0s', issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE }
    );
    // Small delay to ensure token is expired
    await new Promise(r => setTimeout(r, 10));
    expect(() => verifyAccessToken(expiredToken)).toThrow('Invalid token: jwt expired');
  });
});

describe('generateRefreshToken', () => {
  it('returns a UUID string', async () => {
    const token = await generateRefreshToken('user_123');
    expect(token).toBeTruthy();
    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});

describe('verifyRefreshToken', () => {
  it('returns user ID for valid token', async () => {
    const userId = await verifyRefreshToken('valid-token');
    expect(userId).toBe('user_123');
  });
});

describe('revokeRefreshToken', () => {
  it('does not throw for valid token', async () => {
    await expect(revokeRefreshToken('some-token')).resolves.not.toThrow();
  });
});

describe('revokeAllUserTokens', () => {
  it('does not throw', async () => {
    await expect(revokeAllUserTokens('user_123')).resolves.not.toThrow();
  });
});
