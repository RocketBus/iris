'use client';

import { createContext, useContext, ReactNode } from 'react';

interface TenantContextType {
  tenant: string;
  role: string;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

interface TenantProviderProps {
  children: ReactNode;
  tenant: string;
  tenantRole: string;
}

export function TenantProvider({ children, tenant, tenantRole }: TenantProviderProps) {
  return (
    <TenantContext.Provider value={{ tenant, role: tenantRole }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}
