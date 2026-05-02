export interface FeatureConfig {
  enabled: boolean;
  name: string;
  description: string;
  dependencies?: string[];
}

export const featuresConfig: Record<string, FeatureConfig> = {
  // Core features (always enabled)
  auth: {
    enabled: true,
    name: 'Authentication',
    description: 'User authentication and session management',
  },
  multiTenant: {
    enabled: true,
    name: 'Multi-tenant',
    description: 'Multi-tenant organization support',
  },
  userManagement: {
    enabled: true,
    name: 'User Management',
    description: 'User roles and permissions',
  },
  auditLog: {
    enabled: true,
    name: 'Audit Log',
    description: 'Organization activity auditing and history',
    dependencies: ['auth', 'multiTenant', 'userManagement'],
  },
};

