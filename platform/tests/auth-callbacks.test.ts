import bcrypt from 'bcryptjs';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Supabase mock ---
let singleResults: Array<{ data: any; error: any }> = [];
let singleIdx = 0;

function createChain() {
  const chain: any = {
    then(resolve: (v: any) => void) { resolve({ data: null, error: null }); },
  };
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.gt = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.single = vi.fn(() => {
    const r = singleResults[singleIdx] ?? { data: null, error: null };
    singleIdx++;
    return Promise.resolve(r);
  });
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: vi.fn(() => createChain()) },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2a$12$hashed'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid') }));

vi.mock('@/lib/debug', () => ({
  debugAuth: vi.fn(),
  debugDatabase: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), trace: vi.fn() },
  logError: vi.fn(),
  RequestTimer: class { checkpoint() {} end() {} },
}));

vi.mock('@/lib/env', () => ({
  env: {
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
    NEXTAUTH_URL: 'http://localhost:3000',
    NEXTAUTH_SECRET: 'test-secret',
    NODE_ENV: 'test',
  },
}));

vi.mock('@/lib/email-domain', () => ({
  getEmailDomain: vi.fn(() => null),
  isPersonalEmailDomain: vi.fn(() => false),
}));

// Mock two-factor and email for 2FA flow
vi.mock('@/lib/two-factor', () => ({
  generate2FACode: vi.fn(() => '123456'),
  store2FACode: vi.fn().mockResolvedValue(undefined),
  generateTOTPSecret: vi.fn(),
  generateTOTPQRCode: vi.fn(),
  generateBackupCodes: vi.fn(),
  verifyTOTPCode: vi.fn(),
  verify2FACode: vi.fn(),
  verifyBackupCode: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  send2FACodeEmail: vi.fn().mockResolvedValue(undefined),
}));

import { authOptions } from '@/lib/auth';

beforeEach(() => {
  vi.clearAllMocks();
  singleResults = [];
  singleIdx = 0;
});

// --- authorize (credentials provider) ---
describe('authorize', () => {
  // Extract the authorize function from the credentials provider
  const credentialsProvider = authOptions.providers.find(
    (p: any) => p.id === 'credentials' || p.name === 'credentials',
  ) as any;
  const authorize = credentialsProvider?.options?.authorize;

  it('returns null when no credentials', async () => {
    if (!authorize) return;
    const result = await authorize(null);
    expect(result).toBeNull();
  });

  it('returns null when no email or password', async () => {
    if (!authorize) return;
    const result = await authorize({ email: '', password: '' });
    expect(result).toBeNull();
  });

  it('returns null when user not found', async () => {
    if (!authorize) return;
    singleResults = [{ data: null, error: { message: 'not found' } }];
    const result = await authorize({ email: 'a@b.com', password: 'pass' });
    expect(result).toBeNull();
  });

  it('throws AccountLocked when account is locked', async () => {
    if (!authorize) return;
    const future = new Date(Date.now() + 60000).toISOString();
    singleResults = [
      { data: { id: 'u1', email: 'a@b.com', locked_until: future, email_verified: true, password_hash: 'h' }, error: null },
    ];
    await expect(authorize({ email: 'a@b.com', password: 'pass' })).rejects.toThrow('AccountLocked');
  });

  it('throws EmailNotVerified when email not verified', async () => {
    if (!authorize) return;
    singleResults = [
      { data: { id: 'u1', email: 'a@b.com', locked_until: null, email_verified: false, password_hash: 'h' }, error: null },
    ];
    await expect(authorize({ email: 'a@b.com', password: 'pass' })).rejects.toThrow('EmailNotVerified');
  });

  it('throws when no password_hash set', async () => {
    if (!authorize) return;
    singleResults = [
      { data: { id: 'u1', email: 'a@b.com', locked_until: null, email_verified: true, password_hash: null }, error: null },
    ];
    await expect(authorize({ email: 'a@b.com', password: 'pass' })).rejects.toThrow('Invalid credentials');
  });

  it('increments failed attempts on wrong password', async () => {
    if (!authorize) return;
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);
    singleResults = [
      { data: { id: 'u1', email: 'a@b.com', locked_until: null, email_verified: true, password_hash: 'h', failed_login_attempts: 0 }, error: null },
    ];
    await expect(authorize({ email: 'a@b.com', password: 'wrong' })).rejects.toThrow('Invalid credentials');
  });

  it('locks account after 5 failed attempts', async () => {
    if (!authorize) return;
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);
    singleResults = [
      { data: { id: 'u1', email: 'a@b.com', locked_until: null, email_verified: true, password_hash: 'h', failed_login_attempts: 4 }, error: null },
    ];
    await expect(authorize({ email: 'a@b.com', password: 'wrong' })).rejects.toThrow('Invalid credentials');
  });

  it('throws Requires2FA:totp when MFA enabled', async () => {
    if (!authorize) return;
    singleResults = [
      { data: { id: 'u1', email: 'a@b.com', locked_until: null, email_verified: true, password_hash: 'h', failed_login_attempts: 0, mfa_enabled: true, mfa_secret: 'secret' }, error: null },
    ];
    await expect(authorize({ email: 'a@b.com', password: 'pass' })).rejects.toThrow('Requires2FA:totp:u1:a@b.com');
  });

  it('returns user when MFA not enabled', async () => {
    if (!authorize) return;
    singleResults = [
      { data: { id: 'u1', email: 'a@b.com', name: 'User', avatar_url: null, locked_until: null, email_verified: true, password_hash: 'h', failed_login_attempts: 0, mfa_enabled: false, mfa_secret: null }, error: null },
    ];
    const result = await authorize({ email: 'a@b.com', password: 'pass' });
    expect(result).toEqual({ id: 'u1', email: 'a@b.com', name: 'User', image: null });
  });

  it('authenticates via login token', async () => {
    if (!authorize) return;
    singleResults = [
      { data: { user_id: 'u1', expires_at: new Date(Date.now() + 60000).toISOString(), used: false }, error: null }, // token lookup
      { data: { id: 'u1', email: 'a@b.com', name: 'User', avatar_url: null, locked_until: null }, error: null }, // user lookup
    ];
    const result = await authorize({ loginToken: 'tok123', email: '', password: '' });
    expect(result).toEqual({ id: 'u1', email: 'a@b.com', name: 'User', image: null });
  });

  it('returns null for invalid login token', async () => {
    if (!authorize) return;
    singleResults = [{ data: null, error: { message: 'not found' } }];
    const result = await authorize({ loginToken: 'bad', email: '', password: '' });
    expect(result).toBeNull();
  });

  it('throws AccountLocked via login token when locked', async () => {
    if (!authorize) return;
    const future = new Date(Date.now() + 60000).toISOString();
    singleResults = [
      { data: { user_id: 'u1', expires_at: new Date(Date.now() + 60000).toISOString(), used: false }, error: null },
      { data: { id: 'u1', email: 'a@b.com', locked_until: future }, error: null },
    ];
    await expect(authorize({ loginToken: 'tok', email: '', password: '' })).rejects.toThrow('AccountLocked');
  });
});

// --- signIn callback ---
describe('authOptions.callbacks.signIn', () => {
  const signIn = authOptions.callbacks.signIn;

  it('returns true for credentials provider', async () => {
    const result = await signIn({ user: {}, account: { provider: 'credentials' } });
    expect(result).toBe(true);
  });

  it('returns true for google provider and logs', async () => {
    const result = await signIn({
      user: { email: 'g@g.com' },
      account: { provider: 'google', type: 'oauth' },
      profile: {},
    });
    expect(result).toBe(true);
  });
});

// --- jwt callback ---
describe('authOptions.callbacks.jwt', () => {
  const jwt = authOptions.callbacks.jwt;

  it('sets token.id from user', async () => {
    const token = await jwt({
      token: { sub: 'old' },
      user: { id: 'u1', email: 'a@b.com' },
      account: { provider: 'credentials' },
    });
    expect(token.id).toBe('u1');
    expect(token.sub).toBe('u1');
  });

  it('returns token unchanged when no user', async () => {
    const token = await jwt({
      token: { sub: 'existing', id: 'existing' },
      user: null,
      account: null,
    });
    expect(token.sub).toBe('existing');
  });

  it('creates new Google OAuth user when not in DB', async () => {
    singleResults = [
      { data: null, error: { code: 'PGRST116', message: 'no rows' } }, // user not found
      { data: { id: 'new-u', email: 'g@g.com', name: 'G', avatar_url: null }, error: null }, // insert
    ];
    const token = await jwt({
      token: { sub: 'google-id' },
      user: { id: 'google-id', email: 'g@g.com', name: 'G', image: null },
      account: { provider: 'google' },
    });
    expect(token.id).toBe('new-u');
  });

  it('links existing user for Google OAuth', async () => {
    singleResults = [
      { data: { id: 'existing-u', email: 'g@g.com', name: 'Old Name', avatar_url: null, locked_until: null }, error: null },
    ];
    const token = await jwt({
      token: { sub: 'google-id' },
      user: { id: 'google-id', email: 'g@g.com', name: 'New Name', image: 'img.png' },
      account: { provider: 'google' },
    });
    expect(token.id).toBe('existing-u');
  });

  it('blocks locked Google OAuth user', async () => {
    const future = new Date(Date.now() + 60000).toISOString();
    singleResults = [
      { data: { id: 'u1', email: 'g@g.com', locked_until: future }, error: null },
    ];
    const result = await jwt({
      token: { sub: 'gid' },
      user: { id: 'gid', email: 'g@g.com', name: 'N', image: null },
      account: { provider: 'google' },
    });
    expect(result).toBe(false);
  });

  it('returns false on DB error for Google OAuth', async () => {
    singleResults = [
      { data: null, error: { code: 'INTERNAL', message: 'db down' } },
    ];
    const result = await jwt({
      token: { sub: 'gid' },
      user: { id: 'gid', email: 'g@g.com' },
      account: { provider: 'google' },
    });
    expect(result).toBe(false);
  });
});

// --- session callback ---
describe('authOptions.callbacks.session', () => {
  const session = authOptions.callbacks.session;

  it('sets user id and loads orgs/prefs', async () => {
    singleResults = [
      // getUserOrganizations select
      { data: { preferences: { language: 'en' }, theme_preference: 'dark', avatar_url: 'img.png' }, error: null },
    ];
    const result = await session({
      session: { user: { email: 'a@b.com' } },
      token: { sub: 'u1' },
    });
    expect(result.user.id).toBe('u1');
  });

  it('handles missing token.sub', async () => {
    const result = await session({
      session: { user: { email: 'a@b.com' } },
      token: {},
    });
    expect(result.user.id).toBeUndefined();
  });
});
