import { cookies } from 'next/headers';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

import { env } from './env';

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

// Client-side Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side Supabase client with service role key
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Server-side Supabase client for SSR
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // The `delete` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

// Database types
export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          plan: string;
          settings: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          plan?: string;
          settings?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          plan?: string;
          settings?: Record<string, unknown>;
          updated_at?: string;
        };
      };
      users: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
      };
      organization_members: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          role: 'owner' | 'admin' | 'member';
          status: 'active' | 'pending' | 'suspended';
          invited_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id: string;
          role: 'owner' | 'admin' | 'member';
          status?: 'active' | 'pending' | 'suspended';
          invited_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          organization_id?: string;
          role?: 'owner' | 'admin' | 'member';
          status?: 'active' | 'pending' | 'suspended';
          invited_by?: string | null;
          updated_at?: string;
        };
      };
      invitations: {
        Row: {
          id: string;
          email: string;
          organization_id: string;
          role: 'owner' | 'admin' | 'member';
          token: string;
          expires_at: string;
          invited_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          organization_id: string;
          role: 'owner' | 'admin' | 'member';
          token: string;
          expires_at: string;
          invited_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          organization_id?: string;
          role?: 'owner' | 'admin' | 'member';
          token?: string;
          expires_at?: string;
          invited_by?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          organization_id: string;
          actor_id: string | null;
          action: string;
          target_type: string | null;
          target_id: string | null;
          metadata: Record<string, unknown>;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          actor_id?: string | null;
          action: string;
          target_type?: string | null;
          target_id?: string | null;
          metadata?: Record<string, unknown>;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          actor_id?: string | null;
          action?: string;
          target_type?: string | null;
          target_id?: string | null;
          metadata?: Record<string, unknown>;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
      };
    };
  };
}
