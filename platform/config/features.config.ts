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
    name: "Authentication",
    description: "User authentication and session management",
  },
  multiTenant: {
    enabled: true,
    name: "Multi-tenant",
    description: "Multi-tenant organization support",
  },
  userManagement: {
    enabled: true,
    name: "User Management",
    description: "User roles and permissions",
  },
  auditLog: {
    enabled: true,
    name: "Audit Log",
    description: "Organization activity auditing and history",
    dependencies: ["auth", "multiTenant", "userManagement"],
  },
  // Email + password authentication. Off by default — Iris deployments rely
  // on GitHub OAuth (and optionally Google) by default. Operators that want
  // manual login can enable this via FEATURES__PASSWORD_AUTH=true.
  // When off: the credentials provider is omitted, the signup/forgot/reset/
  // verify-email/verify-2fa pages redirect to /auth/signin, and the related
  // API routes 404.
  passwordAuth: {
    enabled: false,
    name: "Password Authentication",
    description: "Email + password signup, login, and recovery flows",
    dependencies: ["auth"],
  },
};
