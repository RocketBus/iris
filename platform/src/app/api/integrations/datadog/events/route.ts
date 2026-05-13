import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/debug";
import { supabaseAdmin } from "@/lib/supabase";
import { validateToken } from "@/lib/tokens";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Returns pre-fetched Datadog DORA events for the caller's organization,
 * scoped to an analysis window. Consumed by the Iris CLI (Python engine)
 * before invoking the aggregator — the engine never talks to Datadog
 * directly.
 *
 * Auth: `Authorization: Bearer <iris_*>` (same token shape as /api/ingest).
 *
 * Query params:
 *   - `from`  ISO 8601 (required) — inclusive lower bound on `started_at`.
 *   - `to`    ISO 8601 (required) — exclusive upper bound on `started_at`.
 *   - `repository_id` (optional)  — when provided, deployments are scoped
 *     to that Iris repository_id. Incidents are always org-wide because
 *     Datadog failures don't carry repository attribution.
 *
 * The response shape mirrors `iris.models.external.ExternalDORAData` so
 * the CLI can hydrate dataclasses directly.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header" },
      { status: 401 },
    );
  }

  const token = await validateToken(authHeader.slice(7));
  if (!token) {
    return NextResponse.json(
      { error: "Invalid or revoked token" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const repositoryId = url.searchParams.get("repository_id");

  if (!from || !to) {
    return NextResponse.json(
      { error: "`from` and `to` query params are required (ISO 8601)" },
      { status: 400 },
    );
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return NextResponse.json(
      { error: "`from` / `to` must be valid ISO 8601 timestamps" },
      { status: 400 },
    );
  }
  if (fromDate >= toDate) {
    return NextResponse.json(
      { error: "`from` must be earlier than `to`" },
      { status: 400 },
    );
  }

  // Confirm the org has an active Datadog integration so the CLI can
  // distinguish "no integration" from "no events in window" via the
  // response shape — `source: null` vs `source: "datadog"`.
  const { data: integration, error: integrationError } = await supabaseAdmin
    .from("org_integrations")
    .select("status")
    .eq("organization_id", token.organization_id)
    .eq("provider", "datadog")
    .maybeSingle();

  if (integrationError) {
    logger.error("integrations/datadog/events: load integration", {
      error: integrationError.message,
    });
    return NextResponse.json(
      { error: "Failed to load integration" },
      { status: 500 },
    );
  }

  if (!integration || integration.status !== "active") {
    return NextResponse.json({
      source: null,
      window: { from: fromDate.toISOString(), to: toDate.toISOString() },
      deployments: [],
      incidents: [],
    });
  }

  let deploymentsQuery = supabaseAdmin
    .from("external_deployments")
    .select(
      "id, provider_event_id, repository_id, dd_repository_id, service, env, team, version, commit_sha, change_failure, deployment_type, source, started_at, finished_at, duration_seconds, number_of_commits, number_of_pull_requests, recovery_time_sec, remediation_type, remediation_id",
    )
    .eq("organization_id", token.organization_id)
    .eq("provider", "datadog")
    .gte("started_at", fromDate.toISOString())
    .lt("started_at", toDate.toISOString())
    .order("started_at", { ascending: true });

  if (repositoryId) {
    deploymentsQuery = deploymentsQuery.eq("repository_id", repositoryId);
  }

  const { data: deployments, error: deploymentsError } = await deploymentsQuery;
  if (deploymentsError) {
    logger.error("integrations/datadog/events: load deployments", {
      error: deploymentsError.message,
    });
    return NextResponse.json(
      { error: "Failed to load deployments" },
      { status: 500 },
    );
  }

  const deploymentIds = (deployments ?? []).map((d) => d.id);
  let commits: Array<{
    deployment_id: string;
    commit_sha: string;
    commit_timestamp: string | null;
    author_email: string | null;
    author_canonical_email: string | null;
    is_bot: boolean | null;
    change_lead_time: number | null;
    time_to_deploy: number | null;
  }> = [];
  if (deploymentIds.length > 0) {
    const { data: commitRows, error: commitsError } = await supabaseAdmin
      .from("external_deployment_commits")
      .select(
        "deployment_id, commit_sha, commit_timestamp, author_email, author_canonical_email, is_bot, change_lead_time, time_to_deploy",
      )
      .in("deployment_id", deploymentIds);

    if (commitsError) {
      logger.error("integrations/datadog/events: load commits", {
        error: commitsError.message,
      });
      return NextResponse.json(
        { error: "Failed to load deployment commits" },
        { status: 500 },
      );
    }
    commits = commitRows ?? [];
  }

  const commitsByDeploymentId = new Map<string, typeof commits>();
  for (const c of commits) {
    const bucket = commitsByDeploymentId.get(c.deployment_id) ?? [];
    bucket.push(c);
    commitsByDeploymentId.set(c.deployment_id, bucket);
  }

  const { data: incidents, error: incidentsError } = await supabaseAdmin
    .from("external_incidents")
    .select(
      "provider_event_id, service, env, team, name, severity, started_at, finished_at, time_to_restore_seconds, source",
    )
    .eq("organization_id", token.organization_id)
    .eq("provider", "datadog")
    .gte("started_at", fromDate.toISOString())
    .lt("started_at", toDate.toISOString())
    .order("started_at", { ascending: true });

  if (incidentsError) {
    logger.error("integrations/datadog/events: load incidents", {
      error: incidentsError.message,
    });
    return NextResponse.json(
      { error: "Failed to load incidents" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    source: "datadog",
    window: { from: fromDate.toISOString(), to: toDate.toISOString() },
    deployments: (deployments ?? []).map((d) => ({
      provider_event_id: d.provider_event_id,
      repository_id: d.repository_id,
      dd_repository_id: d.dd_repository_id,
      service: d.service,
      env: d.env,
      team: d.team,
      version: d.version,
      commit_sha: d.commit_sha,
      change_failure: d.change_failure,
      deployment_type: d.deployment_type,
      source: d.source,
      started_at: d.started_at,
      finished_at: d.finished_at,
      duration_seconds: d.duration_seconds,
      number_of_commits: d.number_of_commits,
      number_of_pull_requests: d.number_of_pull_requests,
      recovery_time_sec: d.recovery_time_sec,
      remediation_type: d.remediation_type,
      remediation_id: d.remediation_id,
      commits: (commitsByDeploymentId.get(d.id) ?? []).map((c) => ({
        commit_sha: c.commit_sha,
        commit_timestamp: c.commit_timestamp,
        author_email: c.author_email,
        author_canonical_email: c.author_canonical_email,
        is_bot: c.is_bot,
        change_lead_time: c.change_lead_time,
        time_to_deploy: c.time_to_deploy,
      })),
    })),
    incidents: incidents ?? [],
  });
}
