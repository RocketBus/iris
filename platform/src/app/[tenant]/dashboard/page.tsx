import { Suspense } from "react";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getServerSession } from "next-auth/next";

import { loadRepoSummaries, type DashboardPanelProps } from "./data";
import { AIAgentUsagePanel } from "./panels/AIAgentUsagePanel";
import { AIDeliveryTimelinePanel } from "./panels/AIDeliveryTimelinePanel";
import { AIvsHumanPanel } from "./panels/AIvsHumanPanel";
import { ChangeAlertPanel } from "./panels/ChangeAlertPanel";
import { CycleTimePanel } from "./panels/CycleTimePanel";
import { DeliveryQualityPanel } from "./panels/DeliveryQualityPanel";
import { DORAPanel } from "./panels/DORAPanel";
import { HealthMapPanel } from "./panels/HealthMapPanel";
import { HyperEngineersPanel } from "./panels/HyperEngineersPanel";
import { IntentDistributionPanel } from "./panels/IntentDistributionPanel";
import { OrgPulsePanel } from "./panels/OrgPulsePanel";
import { OrgTimelinePanel } from "./panels/OrgTimelinePanel";
import { PRHealthPanel } from "./panels/PRHealthPanel";
import {
  HeroRowSkeleton,
  MetricGridSkeleton,
  SectionSkeleton,
  SplitSectionSkeleton,
} from "./panels/skeletons";
import { ToolComparisonPanel } from "./panels/ToolComparisonPanel";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WindowSelector } from "@/components/WindowSelector";
import { authOptions } from "@/lib/auth";
import {
  getAvailableWindowDays,
  resolveWindowDays,
  parseWindowParam,
} from "@/lib/queries/temporal";
import { getServerTranslation } from "@/lib/server-translation";
import { supabaseAdmin } from "@/lib/supabase";

export default async function OrgDashboardPage({
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

  // Analysis window (issue #80): only offer windows that have data, then
  // recompute every section for the chosen one.
  const availableWindows = await getAvailableWindowDays(supabaseAdmin, org.id);
  const windowDays = resolveWindowDays(
    parseWindowParam(windowParam),
    availableWindows,
  );

  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("user_id", session.user.id)
    .eq("organization_id", org.id)
    .single();

  const role = membership?.role as "owner" | "admin" | "member" | undefined;
  const canSeeHyperEngineers = role === "owner" || role === "admin";

  // The shell waits on this one query — two reads against pre-aggregated
  // tables, no JSONB — because the header count and the empty state need it.
  // Everything heavier resolves inside the panels below, each streaming in
  // on its own instead of holding up the page.
  const repoSummaries = await loadRepoSummaries(org.id, windowDays);

  if (repoSummaries.length === 0) {
    const { t } = await getServerTranslation();
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold">{org.name}</h1>
          <p className="text-sm text-muted-foreground">0 repositories</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="max-w-md text-sm text-muted-foreground">
              {t("connect.subtitle")}
            </p>
            <Button asChild>
              <Link href={`/${tenant}/connect`}>
                {t("connect.emptyStateLink")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const panelProps: DashboardPanelProps = {
    orgId: org.id,
    windowDays,
    tenantSlug: tenant,
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{org.name}</h1>
          <p className="text-sm text-muted-foreground">
            {repoSummaries.length} repositories
          </p>
        </div>
        <WindowSelector windowDays={windowDays} options={availableWindows} />
      </div>

      {/* Change detection alerts. No fallback: most orgs have zero changes,
          so a skeleton here would flash phantom alerts on every load. */}
      <Suspense fallback={null}>
        <ChangeAlertPanel {...panelProps} />
      </Suspense>

      {/* Org pulse hero cards */}
      <Suspense fallback={<HeroRowSkeleton />}>
        <OrgPulsePanel {...panelProps} />
      </Suspense>

      {/* Delivery quality */}
      <Suspense fallback={<SplitSectionSkeleton />}>
        <DeliveryQualityPanel {...panelProps} />
      </Suspense>

      {/* DORA — real metrics from a connected Datadog integration */}
      <Suspense fallback={<MetricGridSkeleton />}>
        <DORAPanel {...panelProps} />
      </Suspense>

      {/* AI vs Human */}
      <Suspense fallback={<SplitSectionSkeleton />}>
        <AIvsHumanPanel {...panelProps} />
      </Suspense>

      {/* AI delivery timeline — what changed after adoption */}
      <Suspense fallback={<SectionSkeleton />}>
        <AIDeliveryTimelinePanel {...panelProps} />
      </Suspense>

      {/* AI tool comparison */}
      <Suspense fallback={<SectionSkeleton height="h-64" />}>
        <ToolComparisonPanel {...panelProps} />
      </Suspense>

      {/* AI-agent usage — tokens/model/duration per repo + usage×durability */}
      <Suspense fallback={<SectionSkeleton />}>
        <AIAgentUsagePanel {...panelProps} />
      </Suspense>

      {/* Intent distribution */}
      <Suspense fallback={<SplitSectionSkeleton />}>
        <IntentDistributionPanel {...panelProps} />
      </Suspense>

      {/* PR health */}
      <Suspense fallback={<MetricGridSkeleton />}>
        <PRHealthPanel {...panelProps} />
      </Suspense>

      {/* Cycle time — open-to-merge duration distribution per repo */}
      <Suspense fallback={<SectionSkeleton />}>
        <CycleTimePanel {...panelProps} />
      </Suspense>

      {/* Health map */}
      <Suspense fallback={<SectionSkeleton />}>
        <HealthMapPanel {...panelProps} />
      </Suspense>

      {/* Org timeline */}
      <Suspense fallback={<SectionSkeleton />}>
        <OrgTimelinePanel {...panelProps} />
      </Suspense>

      {/* Hyper engineers — restrito a owner/admin */}
      {canSeeHyperEngineers && (
        <Suspense fallback={<SectionSkeleton height="h-40" />}>
          <HyperEngineersPanel {...panelProps} />
        </Suspense>
      )}
    </div>
  );
}
