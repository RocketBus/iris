import type { ReactNode } from 'react';

import { notFound, redirect } from 'next/navigation';

import { getServerSession } from 'next-auth/next';

import { TenantNavbar } from '@/components/tenant/TenantNavbar';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { TenantSidebar } from '@/components/tenant/TenantSidebar';
import { authOptions } from '@/lib/auth';
import { debugDatabase } from '@/lib/debug';
import { checkTenantAccess } from '@/lib/tenant';

interface TenantLayoutParams {
  tenant: string;
}

interface TenantLayoutProps {
  children: ReactNode;
  params: Promise<TenantLayoutParams>;
}

type SessionUser = {
  id?: string;
  email?: string | null;
  organizations?: Array<{
    id: string;
    name: string;
    slug: string;
    plan?: string | null;
    logo_url?: string | null;
    role?: string | null;
  }>;
};

export default async function TenantLayout({ children, params }: TenantLayoutProps) {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect('/auth/signin');
  }

  const { tenant } = await params;
  const sessionUser = session.user as SessionUser | undefined;
  const userId = sessionUser?.id ?? '';
  const organizationCount = sessionUser?.organizations?.length ?? 0;
  
  // Check if user has access to this tenant
  debugDatabase('Session object received', { 
    hasSession: !!session,
    hasUser: !!session?.user,
    userEmail: session?.user?.email,
    userId,
    sessionKeys: Object.keys(session || {}),
    userKeys: Object.keys(session?.user || {}),
    sessionUserOrganizations: organizationCount,
  });
  
  debugDatabase('Tenant layout access check', { 
    tenant, 
    userId, 
    userEmail: session.user?.email 
  });
  
  const { hasAccess, role } = await checkTenantAccess(tenant, userId);
  
  debugDatabase('Tenant access result', { 
    tenant, 
    userId, 
    hasAccess, 
    role 
  });
  
  if (!hasAccess) {
    debugDatabase('Access denied - returning 404', { tenant, userId });
    notFound();
  }

      return (
        <TenantProvider tenant={tenant} tenantRole={role || 'member'}>
          <div className="min-h-screen bg-background">
            <TenantNavbar />
            <div className="flex">
              <TenantSidebar />
              <main className="min-w-0 flex-1 p-4 sm:p-6">
                {children}
              </main>
            </div>
          </div>
        </TenantProvider>
      );
}
