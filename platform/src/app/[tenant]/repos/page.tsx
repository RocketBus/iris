import { notFound, redirect } from "next/navigation";

import { getServerSession } from "next-auth/next";

import { RepoList } from "../dashboard/repo-list";

import { WindowSelector } from "@/components/WindowSelector";
import { authOptions } from "@/lib/auth";
import {
  getAvailableWindowDays,
  resolveWindowDays,
  parseWindowParam,
  getOrgReposSummary,
} from "@/lib/queries/temporal";
import { getServerTranslation } from "@/lib/server-translation";
import { supabaseAdmin } from "@/lib/supabase";

export default async function ReposPage({
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
  const { t } = await getServerTranslation();

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id, name")
    .eq("slug", tenant)
    .single();

  if (!org) notFound();

  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("user_id", session.user.id)
    .eq("organization_id", org.id)
    .single();

  const role = membership?.role as "owner" | "admin" | "member" | undefined;
  const canDelete = role === "owner" || role === "admin";

  // Analysis window (issue #80): resolve to a window the org actually has
  // data for, instead of defaulting to 90d and showing every repo as "0
  // runs" when the org ingests under a different window.
  const availableWindows = await getAvailableWindowDays(supabaseAdmin, org.id);
  const windowDays = resolveWindowDays(
    parseWindowParam(windowParam),
    availableWindows,
  );

  const repoSummaries = await getOrgReposSummary(
    supabaseAdmin,
    org.id,
    windowDays,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("repos.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("repos.subtitle", {
              count: repoSummaries.length,
              org: org.name,
            })}
          </p>
        </div>
        <WindowSelector windowDays={windowDays} options={availableWindows} />
      </div>

      <RepoList
        repos={repoSummaries}
        orgSlug={tenant}
        organizationId={org.id}
        canDelete={canDelete}
        showSearch
      />
    </div>
  );
}
