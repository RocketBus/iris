import { headers } from "next/headers";

import { debugDatabase, logError } from "./debug";
import { env } from "./env";
import { TenantContext } from "./tenant-utils";

// The canonical public hostname of this deployment (e.g. "iris.clickbus.com").
// A request whose Host header equals this is the public site, NOT a tenant —
// otherwise the canonical domain itself gets treated as a tenant subdomain.
const CANONICAL_HOSTNAME: string | null = (() => {
  try {
    return new URL(env.NEXT_PUBLIC_APP_URL).hostname;
  } catch {
    return null;
  }
})();

/**
 * Extract tenant information from the request (Server-side only)
 * Supports both subdomain routing (company.app.com) and path routing (app.com/company)
 */
export async function getTenantFromRequest(): Promise<TenantContext> {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const pathname = headersList.get("x-pathname") || "";

  // Remove port from hostname
  const hostname = host.split(":")[0];

  // Subdomain tenant routing — only when this is a *real* subdomain of the
  // canonical deployment (e.g. "acme.iris.clickbus.com"), not the canonical
  // hostname itself ("iris.clickbus.com").
  if (
    CANONICAL_HOSTNAME &&
    hostname !== CANONICAL_HOSTNAME &&
    hostname.endsWith(`.${CANONICAL_HOSTNAME}`)
  ) {
    const tenant = hostname.slice(
      0,
      hostname.length - CANONICAL_HOSTNAME.length - 1,
    );
    // Reject nested subdomains and obvious non-tenant labels
    if (tenant && !tenant.includes(".") && tenant !== "www") {
      return {
        tenant,
        isSubdomain: true,
        hostname: CANONICAL_HOSTNAME,
      };
    }
  }

  // Check for path-based routing (e.g., /company/dashboard)
  const pathParts = pathname.split("/").filter(Boolean);
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
  userId: string,
): Promise<{ hasAccess: boolean; role?: string }> {
  try {
    debugDatabase("Checking tenant access", { tenant, userId });

    const { supabaseAdmin } = await import("./supabase");

    // Get organization by slug
    debugDatabase("Looking up organization by slug", { tenant });
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("id, name, slug")
      .eq("slug", tenant)
      .single();

    if (orgError) {
      debugDatabase("Organization lookup failed", {
        tenant,
        error: orgError.message,
        code: orgError.code,
      });
      return { hasAccess: false };
    }

    if (!org) {
      debugDatabase("Organization not found", { tenant });
      return { hasAccess: false };
    }

    debugDatabase("Organization found", {
      tenant,
      orgId: org.id,
      orgName: org.name,
    });

    // Check user membership
    debugDatabase("Checking user membership", { userId, orgId: org.id });
    const { data: membership, error: memberError } = await supabaseAdmin
      .from("organization_members")
      .select("role, status, created_at")
      .eq("user_id", userId)
      .eq("organization_id", org.id)
      .eq("status", "active")
      .single();

    if (memberError) {
      debugDatabase("Membership lookup failed", {
        userId,
        orgId: org.id,
        error: memberError.message,
        code: memberError.code,
      });
      return { hasAccess: false };
    }

    if (!membership) {
      debugDatabase("No active membership found", { userId, orgId: org.id });
      return { hasAccess: false };
    }

    debugDatabase("Membership found", {
      userId,
      orgId: org.id,
      role: membership.role,
      status: membership.status,
      joinedAt: membership.created_at,
    });

    return {
      hasAccess: true,
      role: membership.role,
    };
  } catch (error) {
    logError(error, "checkTenantAccess");
    return { hasAccess: false };
  }
}
