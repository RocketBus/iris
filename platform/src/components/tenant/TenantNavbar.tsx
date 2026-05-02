"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { LogOut, Settings, Building2, Plus, User } from "lucide-react";
import { useSession, signOut } from "next-auth/react";

import { TenantMobileNav } from "./TenantMobileNav";
import { useTenant } from "./TenantProvider";

import { ApertureMark } from "@/components/brand/ApertureMark";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/hooks/useTranslation";
import { getUserAvatarUrl } from "@/lib/avatar";

type SessionOrganization = {
  id: string;
  name: string;
  slug: string;
  plan?: string | null;
  logo_url?: string | null;
  role?: "owner" | "admin" | "member" | string;
};

type SessionUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  organizations?: SessionOrganization[];
};

export function TenantNavbar() {
  const { data: session } = useSession();
  const { tenant, role } = useTenant();
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation();

  // Get current organization info
  const sessionUser = session?.user as SessionUser | undefined;
  const organizations = sessionUser?.organizations ?? [];
  const currentOrganization = organizations.find((org) => org.slug === tenant);

  const handleSignOut = () => {
    signOut({ callbackUrl: "/" });
  };

  const handleOrganizationChange = (orgSlug: string) => {
    // Extract the current path without the organization prefix
    const pathWithoutOrg = pathname.replace(/^\/[^\/]+/, "");
    const newPath = `/${orgSlug}${pathWithoutOrg}`;
    router.push(newPath);
  };

  const handleCreateOrganization = () => {
    router.push("/setup");
  };

  const showOrganizationsSection =
    organizations.length > 0 || pathname === "/setup";

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between gap-2 px-2 sm:px-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <TenantMobileNav />
          <Link
            href={
              currentOrganization
                ? `/${currentOrganization.slug}/dashboard`
                : "/"
            }
            className="flex flex-shrink-0 items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ApertureMark className="size-5 text-primary" />
            <span className="text-sm font-semibold tracking-tight">Iris</span>
          </Link>
          {/* Organization name/role badge — compact on mobile, full on sm+ */}
          {currentOrganization && (
            <div className="flex min-w-0 items-center gap-2 rounded-md bg-muted/50 px-2 py-1 sm:px-3">
              <Building2 className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
              <span className="truncate text-sm font-medium">
                {currentOrganization.name}
              </span>
              <span className="hidden text-xs capitalize text-muted-foreground sm:inline">
                ({t(`roles.${currentOrganization.role ?? "member"}`)})
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 sm:gap-4">
          {sessionUser && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-10 w-10 rounded-full p-0"
                  aria-label={
                    sessionUser.name || sessionUser.email || "User menu"
                  }
                >
                  <Avatar className="h-8 w-8">
                    {(() => {
                      const avatarUrl = getUserAvatarUrl(
                        sessionUser.image || null,
                        sessionUser.email || "",
                        32,
                      );
                      return avatarUrl ? (
                        <AvatarImage
                          src={avatarUrl}
                          alt={sessionUser.name || ""}
                        />
                      ) : null;
                    })()}
                    <AvatarFallback>
                      {sessionUser.name?.charAt(0).toUpperCase() ||
                        sessionUser.email?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[min(calc(100vw-1rem),18rem)]"
                align="end"
                sideOffset={8}
                forceMount
              >
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {sessionUser.name}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {sessionUser.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                {pathname !== "/setup" &&
                  tenant !== "setup" &&
                  currentOrganization && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href={`/${currentOrganization.slug}/profile`}>
                          <Settings className="mr-2 h-4 w-4" />
                          <span>{t("navigation.profileAndSettings")}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/me/ai-usage">
                          <User className="mr-2 h-4 w-4" />
                          <span>{t("navigation.myAiUsage")}</span>
                        </Link>
                      </DropdownMenuItem>
                      {(role === "owner" || role === "admin") && (
                        <DropdownMenuItem asChild>
                          <Link href={`/${currentOrganization.slug}/settings`}>
                            <Building2 className="mr-2 h-4 w-4" />
                            <span>{t("navigation.organizationSettings")}</span>
                          </Link>
                        </DropdownMenuItem>
                      )}
                    </>
                  )}

                {showOrganizationsSection && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t("navigation.organizations")}
                      </p>
                    </div>

                    {organizations.map((org) => (
                      <DropdownMenuItem
                        key={org.id}
                        onClick={() => handleOrganizationChange(org.slug)}
                        className="flex items-center gap-3 px-3 py-2"
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">
                            <Building2 className="h-3 w-3" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col items-start flex-1">
                          <span className="text-sm font-medium">
                            {org.name}
                          </span>
                          <span className="text-xs text-muted-foreground capitalize">
                            {t(`roles.${org.role ?? "member"}`)}
                          </span>
                        </div>
                        {currentOrganization &&
                          org.slug === currentOrganization.slug && (
                            <div className="h-2 w-2 rounded-full bg-primary" />
                          )}
                      </DropdownMenuItem>
                    ))}

                    <DropdownMenuItem
                      onClick={handleCreateOrganization}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          <Plus className="h-3 w-3" />
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">
                        {t("navigation.createOrganization")}
                      </span>
                    </DropdownMenuItem>
                  </>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>{t("navigation.signOut")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </nav>
  );
}
