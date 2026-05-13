import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ArrowLeft } from "lucide-react";
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
    </div>
  );
}
