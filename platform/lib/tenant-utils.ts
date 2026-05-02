export interface TenantContext {
  tenant: string | null;
  isSubdomain: boolean;
  hostname: string;
}

/**
 * Validate tenant slug format
 */
export function isValidTenantSlug(slug: string): boolean {
  // Allow alphanumeric characters and hyphens, 3-50 characters
  const slugRegex = /^[a-zA-Z0-9-]{3,50}$/;
  return slugRegex.test(slug) && !slug.startsWith('-') && !slug.endsWith('-');
}

/**
 * Generate a unique tenant slug from organization name
 */
export function generateTenantSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .substring(0, 50) // Limit length
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}
