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
import { checkTenantAccess } from "@/lib/tenant";

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

  // Deduped (React cache()) against the [tenant] layout's own call for the
  // same (tenant, userId) — this used to re-run its own org-by-slug and
  // membership-by-user queries here, duplicating exactly what the layout
  // had already fetched to decide whether to render this page at all.
  const { hasAccess, role, orgId, orgName } = await checkTenantAccess(
    tenant,
    session.user.id,
  );
  if (!hasAccess || !orgId || !orgName) notFound();

  const canDelete = role === "owner" || role === "admin";

  // Analysis window (issue #80): resolve to a window the org actually has
  // data for, instead of defaulting to 90d and showing every repo as "0
  // runs" when the org ingests under a different window.
  const availableWindows = await getAvailableWindowDays(supabaseAdmin, orgId);
  const windowDays = resolveWindowDays(
    parseWindowParam(windowParam),
    availableWindows,
  );

  const repoSummaries = await getOrgReposSummary(
    supabaseAdmin,
    orgId,
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
              org: orgName,
              noun:
                repoSummaries.length === 1
                  ? t("repos.repositorySingular")
                  : t("repos.repositoryPlural"),
            })}
          </p>
        </div>
        <WindowSelector windowDays={windowDays} options={availableWindows} />
      </div>

      <RepoList
        repos={repoSummaries}
        orgSlug={tenant}
        organizationId={orgId}
        canDelete={canDelete}
        showSearch
      />
    </div>
  );
}
