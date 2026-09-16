import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getServerSession } from "next-auth/next";

import { FlowView } from "./flow-view";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authOptions } from "@/lib/auth";
import { getBoardFlow, getOrgBoards } from "@/lib/queries/board-flow-data";
import { getServerTranslation } from "@/lib/server-translation";
import { supabaseAdmin } from "@/lib/supabase";

export default async function BoardFlowPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ board?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin");

  const { tenant } = await params;
  const { board: boardParam } = await searchParams;
  const { t } = await getServerTranslation();

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id, name")
    .eq("slug", tenant)
    .single();

  if (!org) notFound();

  const boards = await getOrgBoards(supabaseAdmin, org.id);

  // `null` means the schema isn't deployed yet (migration 023 not applied);
  // `[]` means no board is configured. Both are "nothing to show", not errors —
  // the nav entry must never 500 on a deployment that hasn't migrated.
  if (boards === null || boards.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("boardFlow.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("boardFlow.subtitle")}
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="max-w-md text-sm text-muted-foreground">
              {t("boardFlow.notConfigured")}
            </p>
            <Button asChild>
              <Link href={`/${tenant}/settings/integrations`}>
                {t("navigation.settings")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selected = boards.find((b) => b.id === boardParam) ?? boards[0];
  const { summary, quality } = await getBoardFlow(supabaseAdmin, selected);

  return (
    <FlowView
      orgSlug={tenant}
      boards={boards.map((b) => ({ id: b.id, title: b.title }))}
      selectedBoardId={selected.id}
      lastSyncedAt={selected.lastSyncedAt}
      summary={summary}
      quality={quality}
    />
  );
}
