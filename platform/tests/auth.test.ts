import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Supabase mock with per-call result queue ---
let singleResults: Array<{ data: any; error: any }> = [];
let singleIdx = 0;

function createChain() {
  const chain: any = {
    // Make the chain thenable so `await chain.update().eq()` resolves to { data, error }
    then(resolve: (v: any) => void) {
      resolve({ data: null, error: null });
    },
  };
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.upsert = vi.fn(() => chain);
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

vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid-token') }));

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

import {
  createUser,
  verifyEmailToken,
  createPasswordResetToken,
  resetPassword,
  createOrganization,
  ensureAutoAcceptedDomainMembership,
  authOptions,
} from '@/lib/auth';
import { getEmailDomain } from '@/lib/email-domain';

beforeEach(() => {
  vi.clearAllMocks();
  singleResults = [];
  singleIdx = 0;
});

// --- authOptions structure ---
describe('authOptions', () => {
  it('exports auth options with JWT strategy', () => {
    expect(authOptions).toBeDefined();
    expect(authOptions.session.strategy).toBe('jwt');
    expect(authOptions.session.maxAge).toBe(30 * 24 * 60 * 60);
    expect(authOptions.pages?.signIn).toBe('/auth/signin');
  });

  it('has at least the credentials provider', () => {
    expect(authOptions.providers.length).toBeGreaterThanOrEqual(1);
  });

  it('has required callbacks', () => {
    expect(authOptions.callbacks.signIn).toBeDefined();
    expect(authOptions.callbacks.redirect).toBeDefined();
    expect(authOptions.callbacks.jwt).toBeDefined();
    expect(authOptions.callbacks.session).toBeDefined();
  });
});

// --- Redirect callback ---
describe('authOptions.callbacks.redirect', () => {
  const base = 'http://localhost:3000';
  const redirect = authOptions.callbacks.redirect;

  it('redirects /auth/signin to post-login', async () => {
    expect(await redirect({ url: '/auth/signin', baseUrl: base })).toBe(`${base}/auth/post-login`);
  });

  it('allows relative paths', async () => {
    expect(await redirect({ url: '/dashboard', baseUrl: base })).toBe(`${base}/dashboard`);
  });

  it('allows same-origin URLs', async () => {
    expect(await redirect({ url: `${base}/page`, baseUrl: base })).toBe(`${base}/page`);
  });

  it('blocks cross-origin → post-login', async () => {
    expect(await redirect({ url: 'https://evil.com', baseUrl: base })).toBe(`${base}/auth/post-login`);
  });
});

// --- Logger/events (exercise code paths) ---
describe('authOptions.logger', () => {
  it('error/warn/debug do not throw', () => {
    authOptions.logger.error('CODE', new Error('e'));
    authOptions.logger.error('CODE', { error: new Error('e') });
    authOptions.logger.warn('W');
    authOptions.logger.debug('D', {});
  });
});

describe('authOptions.events', () => {
  it('error event handles Error and string', async () => {
    await authOptions.events.error(new Error('fail'));
    await authOptions.events.error({ error: new Error('wrapped') });
    await authOptions.events.error('string');
  });

  it('signInError event handles Error and string', async () => {
    if (authOptions.events.signInError) {
      await authOptions.events.signInError({ error: new Error('e'), provider: 'google' });
      await authOptions.events.signInError({ error: 'str' });
    }
  });

  it('signIn event for google provider', async () => {
    await authOptions.events.signIn({
      user: { email: 'test@test.com' },
      account: { provider: 'google' },
      profile: {},
      isNewUser: true,
    });
  });
});

// --- createUser ---
describe('createUser', () => {
  it('creates a user and returns data', async () => {
    singleResults = [
      { data: { id: 'u1', email: 'a@b.com', email_verified: false }, error: null },
    ];
    const user = await createUser('a@b.com', 'A', 'hash', 'tok', new Date());
    expect(user.id).toBe('u1');
  });

  it('throws on database error', async () => {
    singleResults = [{ data: null, error: { message: 'dup', code: '23505' } }];
    await expect(createUser('a@b.com', 'A', 'h', 't', new Date())).rejects.toBeDefined();
  });
});

// --- verifyEmailToken ---
describe('verifyEmailToken', () => {
  it('returns success for valid token', async () => {
    singleResults = [
      { data: { id: 'u1', email: 'a@b.com' }, error: null }, // select user
    ];
    // update().eq() is thenable → resolves to { data: null, error: null }
    const result = await verifyEmailToken('valid');
    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
  });

  it('returns failure for invalid token', async () => {
    singleResults = [{ data: null, error: { message: 'not found' } }];
    const result = await verifyEmailToken('bad');
    expect(result.success).toBe(false);
  });
});

// --- createPasswordResetToken ---
describe('createPasswordResetToken', () => {
  it('returns token for existing user', async () => {
    singleResults = [
      { data: { id: 'u1', email: 'a@b.com' }, error: null },
    ];
    const result = await createPasswordResetToken('a@b.com');
    expect(result.success).toBe(true);
    expect(result.token).toBe('mock-uuid-token');
  });

  it('returns failure when user not found', async () => {
    singleResults = [{ data: null, error: { message: 'not found' } }];
    const result = await createPasswordResetToken('nobody@b.com');
    expect(result.success).toBe(false);
  });
});

// --- resetPassword ---
describe('resetPassword', () => {
  it('resets password for valid token', async () => {
    singleResults = [
      { data: { id: 'u1' }, error: null }, // find user by token
    ];
    const result = await resetPassword('tok', 'newpass');
    expect(result.success).toBe(true);
  });

  it('returns failure for invalid token', async () => {
    singleResults = [{ data: null, error: { message: 'not found' } }];
    const result = await resetPassword('bad', 'newpass');
    expect(result.success).toBe(false);
  });
});

// --- createOrganization ---
describe('createOrganization', () => {
  it('creates org and adds owner', async () => {
    singleResults = [
      { data: { id: 'org1', name: 'Org', slug: 'org' }, error: null }, // insert org
      { data: { id: 'mem1' }, error: null }, // insert member
    ];
    const org = await createOrganization('u1', 'Org', 'org');
    expect(org.id).toBe('org1');
  });

  it('throws on org creation error', async () => {
    singleResults = [{ data: null, error: { message: 'dup slug' } }];
    await expect(createOrganization('u1', 'O', 'dup')).rejects.toBeDefined();
  });
});

// --- ensureAutoAcceptedDomainMembership ---
describe('ensureAutoAcceptedDomainMembership', () => {
  it('skips when email is null', async () => {
    vi.mocked(getEmailDomain).mockReturnValueOnce(null);
    await ensureAutoAcceptedDomainMembership('u1', null);
  });

  it('skips for personal email domains', async () => {
    vi.mocked(getEmailDomain).mockReturnValueOnce('gmail.com');
    const { isPersonalEmailDomain } = await import('@/lib/email-domain');
    vi.mocked(isPersonalEmailDomain).mockReturnValueOnce(true);
    await ensureAutoAcceptedDomainMembership('u1', 'user@gmail.com');
  });
});
