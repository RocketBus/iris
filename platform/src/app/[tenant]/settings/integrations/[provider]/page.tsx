import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ArrowLeft } from "lucide-react";
import { getServerSession } from "next-auth/next";

import {
  DatadogConnectForm,
  type DatadogIntegrationStatus,
} from "@/components/integrations/datadog-connect-form";
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

const SUPPORTED_PROVIDERS = new Set(["datadog"]);

interface ProviderPageProps {
  params: Promise<{ tenant: string; provider: string }>;
}

export default async function IntegrationProviderPage({
  params,
}: ProviderPageProps) {
  const session = await getServerSession(authOptions);
  const { t } = await getServerTranslation();
  if (!session?.user?.id) redirect("/auth/signin");

  const { tenant, provider } = await params;
  if (!SUPPORTED_PROVIDERS.has(provider)) notFound();

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id")
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

  let initial: DatadogIntegrationStatus = { status: "not_connected" };
  if (provider === "datadog") {
    const { data } = await supabaseAdmin
      .from("org_integrations")
      .select(
        "status, config, last_sync_at, last_error, created_at, updated_at",
      )
      .eq("organization_id", org.id)
      .eq("provider", "datadog")
      .maybeSingle();

    if (data) {
      const config = (data.config ?? {}) as {
        site?: string;
        apiKeyMask?: string;
      };
      const { count: unmatchedCount } = await supabaseAdmin
        .from("external_deployments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .eq("provider", "datadog")
        .is("repository_id", null);

      initial = {
        status: data.status as "active" | "error" | "disconnected",
        site: config.site ?? null,
        apiKeyMask: config.apiKeyMask ?? null,
        lastSyncAt: data.last_sync_at,
        lastError: data.last_error,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        unmatchedDeploymentsCount: unmatchedCount ?? 0,
      };
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/${tenant}/settings/integrations`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("settings.integrations.detail.backLink")}
      </Link>

      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">
          {t(`settings.integrations.providers.${provider}.name`)}
        </h1>
        <p className="text-muted-foreground">
          {t(`settings.integrations.providers.${provider}.description`)}
        </p>
      </div>

      {provider === "datadog" ? (
        <DatadogConnectForm organizationId={org.id} initial={initial} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("settings.integrations.detail.comingSoonTitle")}
            </CardTitle>
            <CardDescription>
              {t("settings.integrations.detail.comingSoonDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t(`settings.integrations.providers.${provider}.detail`)}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
