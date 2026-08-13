import { notFound, redirect } from "next/navigation";

import { getServerSession } from "next-auth/next";

import { AIExposureView } from "./ai-exposure-view";

import { WindowSelector } from "@/components/WindowSelector";
import { authOptions } from "@/lib/auth";
import { getOrgLatestPayloads } from "@/lib/queries/org-summary";
import { computeShadowAIExposure } from "@/lib/queries/shadow-ai";
import {
  getAvailableWindowDays,
  resolveWindowDays,
  parseWindowParam,
  getOrgReposSummary,
} from "@/lib/queries/temporal";
import { getServerTranslation } from "@/lib/server-translation";
import { supabaseAdmin } from "@/lib/supabase";

export default async function AIExposurePage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ window?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin");

  const { tenant } = await params;
  const { window: windowParam } = await searchParams;

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id, name")
    .eq("slug", tenant)
    .single();

  if (!org) notFound();

  // Analysis window (issue #80): resolve to a window the org actually has
  // data for, instead of defaulting to 90d and showing every repo as
  // unanalyzed when the org ingests under a different window.
  const availableWindows = await getAvailableWindowDays(supabaseAdmin, org.id);
  const windowDays = resolveWindowDays(
    parseWindowParam(windowParam),
    availableWindows,
  );

  const repos = await getOrgReposSummary(supabaseAdmin, org.id, windowDays);
  const payloads = await getOrgLatestPayloads(
    supabaseAdmin,
    org.id,
    repos.map((r) => r.id),
    windowDays,
  );

  const exposure = computeShadowAIExposure(
    repos.map((r) => ({ id: r.id, name: r.name })),
    payloads,
  );

  const { t } = await getServerTranslation();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("aiExposure.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("aiExposure.subtitle")}
          </p>
        </div>
        <WindowSelector windowDays={windowDays} options={availableWindows} />
      </div>

      <AIExposureView exposure={exposure} tenantSlug={tenant} />
    </div>
  );
}
