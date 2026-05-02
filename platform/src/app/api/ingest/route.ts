import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabase";
import { withSpan, recordError } from "@/lib/telemetry";
import { validateToken } from "@/lib/tokens";

// Allow up to 60s — large repos can ship sizeable metrics payloads.
export const maxDuration = 60;

/**
 * Ingest schema — validates the CLI payload.
 * Core fields are required; everything else is optional (matches ReportMetrics.to_dict()).
 */
const ingestSchema = z.object({
  repository: z.string().min(1),
  remote_url: z.string().url().optional(),
  window_days: z.number().int().positive().default(90),
  cli_version: z.string().optional(),
  github_user: z.string().optional(),
  active_users: z
    .array(
      z.union([
        z.string(),
        z.object({ name: z.string(), github: z.string().optional() }),
      ]),
    )
    .optional(),
  metrics: z
    .object({
      // Core (required)
      commits_total: z.number().int(),
      commits_revert: z.number().int(),
      revert_rate: z.number(),
      churn_events: z.number().int(),
      churn_lines_affected: z.number().int(),
      files_touched: z.number().int(),
      files_stabilized: z.number().int(),
      stabilization_ratio: z.number(),
    })
    .passthrough(), // Allow all optional fields through
});

export async function POST(request: Request) {
  return withSpan(
    "ingest",
    { "http.method": "POST", "http.route": "/api/ingest" },
    async (parentSpan) => {
      // 1. Validate token
      const authHeader = request.headers.get("authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return Response.json(
          { error: "Missing or invalid Authorization header" },
          { status: 401 },
        );
      }

      const token = authHeader.slice(7);
      const tokenData = await validateToken(token);

      if (!tokenData) {
        return Response.json(
          { error: "Invalid or revoked token" },
          { status: 401 },
        );
      }

      // 2. Parse and validate body
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
      }

      const parsed = ingestSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          { error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 },
        );
      }

      const {
        repository,
        remote_url,
        window_days,
        github_user,
        active_users,
        metrics,
      } = parsed.data;

      // Prefer version from header; fall back to body field for older CLIs
      const cli_version =
        request.headers.get("x-iris-cli-version") ??
        parsed.data.cli_version ??
        null;

      // 3. Find or create repository
      const { data: existingRepo } = await supabaseAdmin
        .from("repositories")
        .select("id")
        .eq("organization_id", tokenData.organization_id)
        .eq("name", repository)
        .single();

      let repositoryId: string;

      if (existingRepo) {
        repositoryId = existingRepo.id;
        // Update remote_url if provided
        if (remote_url) {
          await supabaseAdmin
            .from("repositories")
            .update({ remote_url, updated_at: new Date().toISOString() })
            .eq("id", repositoryId);
        }
      } else {
        const { data: newRepo, error: repoError } = await supabaseAdmin
          .from("repositories")
          .insert({
            organization_id: tokenData.organization_id,
            name: repository,
            remote_url: remote_url ?? null,
          })
          .select("id")
          .single();

        if (repoError || !newRepo) {
          return Response.json(
            {
              error: "Failed to create repository",
              details: repoError?.message,
            },
            { status: 500 },
          );
        }
        repositoryId = newRepo.id;
      }

      // 4. Create analysis run
      const { data: run, error: runError } = await supabaseAdmin
        .from("analysis_runs")
        .insert({
          repository_id: repositoryId,
          organization_id: tokenData.organization_id,
          window_days,
          commits_total: metrics.commits_total,
          cli_version,
          github_user: github_user ?? null,
          active_users: active_users ?? null,
        })
        .select("id")
        .single();

      if (runError || !run) {
        return Response.json(
          {
            error: "Failed to create analysis run",
            details: runError?.message,
          },
          { status: 500 },
        );
      }

      // 5. Store metrics (full payload + indexed columns)
      const { error: metricsError } = await supabaseAdmin
        .from("metrics")
        .insert({
          analysis_run_id: run.id,
          organization_id: tokenData.organization_id,
          repository_id: repositoryId,
          payload: metrics,
          stabilization_ratio: metrics.stabilization_ratio,
          revert_rate: metrics.revert_rate,
          churn_events: metrics.churn_events,
          commits_total: metrics.commits_total,
          ai_detection_coverage_pct:
            ((metrics as Record<string, unknown>).ai_detection_coverage_pct as
              | number
              | undefined) ?? null,
          pr_merged_count:
            ((metrics as Record<string, unknown>).pr_merged_count as
              | number
              | undefined) ?? null,
          pr_single_pass_rate:
            ((metrics as Record<string, unknown>).pr_single_pass_rate as
              | number
              | undefined) ?? null,
          fix_latency_median_hours:
            ((metrics as Record<string, unknown>).fix_latency_median_hours as
              | number
              | undefined) ?? null,
          cascade_rate:
            ((metrics as Record<string, unknown>).cascade_rate as
              | number
              | undefined) ?? null,
        });

      if (metricsError) {
        recordError(new Error(metricsError.message));
        return Response.json(
          { error: "Failed to store metrics", details: metricsError.message },
          { status: 500 },
        );
      }

      parentSpan.setAttributes({
        "iris.repository": repository,
        "iris.run_id": run.id,
        "iris.commits_total": metrics.commits_total,
        ...(cli_version ? { "iris.cli_version": cli_version } : {}),
      });

      return Response.json(
        { run_id: run.id, repository_id: repositoryId },
        { status: 201 },
      );
    },
  ); // end withSpan
}
