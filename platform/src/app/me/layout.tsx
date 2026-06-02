import type { ReactNode } from "react";

import { redirect } from "next/navigation";

import { getServerSession } from "next-auth/next";

import { TenantNavbar } from "@/components/tenant/TenantNavbar";
import { TenantProvider } from "@/components/tenant/TenantProvider";
import { authOptions } from "@/lib/auth";

type SessionOrganization = {
  slug: string;
  role?: string | null;
};

type SessionUser = {
  organizations?: SessionOrganization[];
};

// Routes under /me are authenticated but cross-organization (self-only), so
// they live outside /[tenant] and never get the tenant layout. Without this
// layout the root ConditionalNavbar fell back to the public/visitor navbar,
// making an authenticated page look logged out (issue #71). Render the
// authenticated TenantNavbar here, scoped to the user's primary org for its
// links and org switcher.
export default async function MeLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/auth/signin?callbackUrl=/me/ai-usage");
  }

  const sessionUser = session.user as SessionUser | undefined;
  const primaryOrg = sessionUser?.organizations?.[0];

  return (
    <TenantProvider
      tenant={primaryOrg?.slug ?? ""}
      tenantRole={primaryOrg?.role ?? "member"}
    >
      <div className="min-h-screen bg-background">
        <TenantNavbar />
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </TenantProvider>
  );
}
