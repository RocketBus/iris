import Link from "next/link";
import { redirect } from "next/navigation";

import { ChevronRight } from "lucide-react";
import { getServerSession } from "next-auth/next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authOptions } from "@/lib/auth";
import { canManageMembers } from "@/lib/permissions";
import { getServerTranslation } from "@/lib/server-translation";
import { supabaseAdmin } from "@/lib/supabase";

interface IntegrationsPageProps {
  params: Promise<{ tenant: string }>;
}

/**
 * Provider catalog. Slice 2 wired the Datadog status to org_integrations;
 * new providers get added here without touching the page layout.
 */
const PROVIDERS = [{ id: "datadog" as const }];

type ProviderStatus = "active" | "error" | "disconnected" | "not_connected";

function statusKey(
  status: ProviderStatus,
): "notConnected" | "connected" | "error" | "disconnected" {
  switch (status) {
    case "active":
      return "connected";
    case "error":
      return "error";
    case "disconnected":
      return "disconnected";
    default:
      return "notConnected";
  }
}

export default async function IntegrationsPage({
  params,
}: IntegrationsPageProps) {
  const session = await getServerSession(authOptions);
  const { t } = await getServerTranslation();
  if (!session?.user?.id) redirect("/auth/signin");

  const { tenant } = await params;

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id, name")
    .eq("slug", tenant)
    .single();
  if (!org) redirect(`/${tenant}/dashboard`);

  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("user_id", session.user.id)
    .eq("organization_id", org.id)
    .single();

  const role = membership?.role as "owner" | "admin" | "member" | undefined;
  if (!role || !canManageMembers(role)) {
    redirect(`/${tenant}/dashboard`);
  }

  const { data: integrations } = await supabaseAdmin
    .from("org_integrations")
    .select("provider, status")
    .eq("organization_id", org.id);

  const statusByProvider = new Map<string, ProviderStatus>();
  for (const row of integrations ?? []) {
    statusByProvider.set(row.provider, row.status as ProviderStatus);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">
          {t("settings.integrations.title")}
        </h1>
        <p className="text-muted-foreground">
          {t("settings.integrations.subtitle")}
        </p>
      </div>

      <div className="grid gap-4">
        {PROVIDERS.map((provider) => {
          const sKey = statusKey(
            statusByProvider.get(provider.id) ?? "not_connected",
          );
          return (
            <Link
              key={provider.id}
              href={`/${tenant}/settings/integrations/${provider.id}`}
              className="block"
            >
              <Card className="transition-colors hover:border-primary/40">
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle className="text-lg">
                      {t(`settings.integrations.providers.${provider.id}.name`)}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {t(
                        `settings.integrations.providers.${provider.id}.description`,
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="rounded-full border border-muted-foreground/30 px-2 py-0.5 text-xs text-muted-foreground">
                      {t(`settings.integrations.status.${sKey}`)}
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t(`settings.integrations.providers.${provider.id}.detail`)}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {t("settings.integrations.footnote")}
      </p>
    </div>
  );
}
