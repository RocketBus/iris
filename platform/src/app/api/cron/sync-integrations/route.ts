import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/debug";
import {
  rematchUnlinkedDeployments,
  syncOrganization,
} from "@/lib/integrations/datadog/sync";
import { supabaseAdmin } from "@/lib/supabase";

// The cron loops sequentially across active integrations; allow it to
// run for the full Fluid Compute default. Per-org sync still has its
// own per-request HTTP timeouts inside the Datadog client.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface PerOrgOutcome {
  organizationId: string;
  ok: boolean;
  deploymentsUpserted?: number;
  commitsUpserted?: number;
  failuresUpserted?: number;
  unmatchedDeployments?: number;
  /** Rows whose `repository_id` flipped from null to a repo this run. */
  rematched?: number;
  error?: string;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // Pick up both healthy and errored integrations. The sync routine
  // flips status to `active` on a successful run and back to `error` on
  // failure, so retrying errored rows is what makes the integration
  // self-heal from transient failures (Datadog rate limits, network
  // blips, post-deploy schema fixes, etc.) without a manual nudge.
  const { data: integrations, error } = await supabaseAdmin
    .from("org_integrations")
    .select("organization_id, provider")
    .in("status", ["active", "error"]);

  if (error) {
    logger.error("cron list integrations failed", { error: error.message });
    return NextResponse.json(
      { message: "Failed to list integrations" },
      { status: 500 },
    );
  }

  const outcomes: PerOrgOutcome[] = [];
  for (const integration of integrations ?? []) {
    if (integration.provider !== "datadog") continue;

    const result = await syncOrganization(
      supabaseAdmin,
      integration.organization_id,
    );

    if ("error" in result) {
      outcomes.push({
        organizationId: integration.organization_id,
        ok: false,
        error: result.error,
      });
      continue;
    }

    // After a successful sync, retroactively match deploys that landed
    // with `repository_id = null` (e.g. ingested before their repo was
    // registered, or before `repositories.remote_url` was populated by
    // the CLI). Failure here doesn't fail the whole run — sync results
    // are independent.
    let rematched = 0;
    try {
      const rematch = await rematchUnlinkedDeployments(
        supabaseAdmin,
        integration.organization_id,
      );
      rematched = rematch.matched;
    } catch (err) {
      logger.warn("cron rematch failed", {
        organizationId: integration.organization_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    outcomes.push({
      organizationId: integration.organization_id,
      ok: true,
      deploymentsUpserted: result.deploymentsUpserted,
      commitsUpserted: result.commitsUpserted,
      failuresUpserted: result.failuresUpserted,
      unmatchedDeployments: result.unmatchedDeployments,
      rematched,
    });
  }

  const succeeded = outcomes.filter((o) => o.ok).length;
  const failed = outcomes.length - succeeded;
  logger.info("cron sync-integrations finished", {
    total: outcomes.length,
    succeeded,
    failed,
  });

  return NextResponse.json({
    total: outcomes.length,
    succeeded,
    failed,
    outcomes,
  });
}

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically
 * when the env var is configured on the project. We accept both that
 * header and an explicit `x-cron-secret` header so the route can be
 * triggered manually from local dev with `curl`.
 *
 * Returns true when CRON_SECRET isn't configured AND we're running in
 * a non-production environment — keeps `npm run dev` ergonomic while
 * still blocking unauthenticated access in production.
 */
function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return process.env.NODE_ENV !== "production";
  }
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${expected}`) return true;
  if (request.headers.get("x-cron-secret") === expected) return true;
  return false;
}
