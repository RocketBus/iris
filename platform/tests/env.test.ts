import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('env validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('validates successfully with all required vars', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    process.env.NEXTAUTH_SECRET = 'test-secret';
    process.env.EMAIL_FROM = 'test@test.com';

    const { env } = await import('@/lib/env');
    expect(env.NEXTAUTH_URL).toBe('http://localhost:3000');
    expect(env.NODE_ENV).toBeDefined();
  });

  it('applies defaults for optional fields', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    process.env.NEXTAUTH_SECRET = 'test-secret';
    process.env.EMAIL_FROM = 'test@test.com';

    const { env } = await import('@/lib/env');
    expect(env.JWT_ISSUER).toBe('iris');
    expect(env.JWT_AUDIENCE).toBe('microservices');
    expect(env.NEXT_PUBLIC_APP_NAME).toBe('Iris');
  });

  it('falls back to placeholders during build', async () => {
    // Remove required vars to trigger validation error
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXTAUTH_URL;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.EMAIL_FROM;
    process.env.npm_lifecycle_event = 'build';

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { env } = await import('@/lib/env');
    spy.mockRestore();

    // Should have fallback values instead of throwing
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://placeholder.supabase.co');
    expect(env.NEXTAUTH_URL).toBe('http://localhost:3000');
  });

  it('throws when required vars missing outside build', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXTAUTH_URL;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.EMAIL_FROM;
    delete process.env.npm_lifecycle_event;

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(import('@/lib/env')).rejects.toThrow('Environment validation failed');
    spy.mockRestore();
  });
});
