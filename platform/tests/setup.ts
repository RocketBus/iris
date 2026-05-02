/**
 * Vitest global setup — sets required env vars before any module loads.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'test-secret-min-32-characters-long';
process.env.EMAIL_FROM = process.env.EMAIL_FROM || 'test@example.com';
// NODE_ENV is read-only in Next.js types; already set by vitest to 'test'
