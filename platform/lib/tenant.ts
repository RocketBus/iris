import { headers } from 'next/headers';

import { debugDatabase, logError } from './debug';
import { TenantContext } from './tenant-utils';

/**
 * Extract tenant information from the request (Server-side only)
 * Supports both subdomain routing (company.app.com) and path routing (app.com/company)
 */
export async function getTenantFromRequest(): Promise<TenantContext> {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const pathname = headersList.get('x-pathname') || '';
  
  // Remove port from hostname
  const hostname = host.split(':')[0];
  
  // Check if it's a subdomain (e.g., company.app.com)
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    // Assume the first part is the tenant subdomain
    const tenant = parts[0];
    const domain = parts.slice(1).join('.');
    
    // Skip if it's localhost or IP address
    if (tenant !== 'localhost' && !/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return {
        tenant,
        isSubdomain: true,
        hostname: domain,
      };
    }
  }
  
  // Check for path-based routing (e.g., /company/dashboard)
  const pathParts = pathname.split('/').filter(Boolean);
  if (pathParts.length > 0) {
    const tenant = pathParts[0];
    return {
      tenant,
      isSubdomain: false,
      hostname,
    };
  }
  
  return {
    tenant: null,
    isSubdomain: false,
    hostname,
  };
}

/**
 * Check if user has access to tenant
 */
export async function checkTenantAccess(
  tenant: string,
  userId: string
): Promise<{ hasAccess: boolean; role?: string }> {
  try {
    debugDatabase('Checking tenant access', { tenant, userId });
    
    const { supabaseAdmin } = await import('./supabase');
    
    // Get organization by slug
    debugDatabase('Looking up organization by slug', { tenant });
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id, name, slug')
      .eq('slug', tenant)
      .single();
    
    if (orgError) {
      debugDatabase('Organization lookup failed', { 
        tenant, 
        error: orgError.message,
        code: orgError.code 
      });
      return { hasAccess: false };
    }
    
    if (!org) {
      debugDatabase('Organization not found', { tenant });
      return { hasAccess: false };
    }
    
    debugDatabase('Organization found', { 
      tenant, 
      orgId: org.id, 
      orgName: org.name 
    });
    
    // Check user membership
    debugDatabase('Checking user membership', { userId, orgId: org.id });
    const { data: membership, error: memberError } = await supabaseAdmin
      .from('organization_members')
      .select('role, status, created_at')
      .eq('user_id', userId)
      .eq('organization_id', org.id)
      .eq('status', 'active')
      .single();
    
    if (memberError) {
      debugDatabase('Membership lookup failed', { 
        userId, 
        orgId: org.id,
        error: memberError.message,
        code: memberError.code 
      });
      return { hasAccess: false };
    }
    
    if (!membership) {
      debugDatabase('No active membership found', { userId, orgId: org.id });
      return { hasAccess: false };
    }
    
    debugDatabase('Membership found', { 
      userId, 
      orgId: org.id, 
      role: membership.role, 
      status: membership.status,
      joinedAt: membership.created_at 
    });
    
    return { 
      hasAccess: true, 
      role: membership.role 
    };
    
  } catch (error) {
    logError(error, 'checkTenantAccess');
    return { hasAccess: false };
  }
}

