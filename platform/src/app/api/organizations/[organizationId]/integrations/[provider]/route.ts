import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { logger } from "@/lib/debug";
import { encryptCredentials, maskSecret } from "@/lib/encryption";
import {
  SUPPORTED_SITES,
  normalizeSite,
  validateCredentials,
  type DatadogSite,
} from "@/lib/integrations/datadog/client";
import { canManageMembers } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase";

const SUPPORTED_PROVIDERS = new Set(["datadog"]);

interface RouteContext {
  params: Promise<{ organizationId: string; provider: string }>;
}

async function authorize(
  request: NextRequest,
  organizationId: string,
): Promise<{ userId: string } | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { data: membership, error } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("user_id", session.user.id)
    .eq("organization_id", organizationId)
    .single();

  if (error || !membership) {
    return NextResponse.json(
      { message: "You are not a member of this organization" },
      { status: 403 },
    );
  }

  if (!canManageMembers(membership.role)) {
    return NextResponse.json(
      {
        message:
          "You do not have permission to manage integrations for this organization",
      },
      { status: 403 },
    );
  }

  return { userId: session.user.id };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { organizationId, provider } = await params;
    if (!SUPPORTED_PROVIDERS.has(provider)) {
      return NextResponse.json(
        { message: "Unknown provider" },
        { status: 404 },
      );
    }

    const auth = await authorize(request, organizationId);
    if (auth instanceof NextResponse) return auth;

    const { data, error } = await supabaseAdmin
      .from("org_integrations")
      .select(
        "id, status, config, last_sync_at, last_error, created_at, updated_at",
      )
      .eq("organization_id", organizationId)
      .eq("provider", provider)
      .maybeSingle();

    if (error) {
      logger.error("integration GET failed", { error: error.message });
      return NextResponse.json(
        { message: "Failed to load integration status" },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json({ status: "not_connected" });
    }

    const config = (data.config ?? {}) as {
      site?: string;
      apiKeyMask?: string;
    };
    return NextResponse.json({
      status: data.status,
      site: config.site ?? null,
      apiKeyMask: config.apiKeyMask ?? null,
      lastSyncAt: data.last_sync_at,
      lastError: data.last_error,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  } catch (err) {
    logger.error("integration GET threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { organizationId, provider } = await params;
    if (provider !== "datadog") {
      return NextResponse.json(
        { message: "Provider not supported yet" },
        { status: 404 },
      );
    }

    const auth = await authorize(request, organizationId);
    if (auth instanceof NextResponse) return auth;

    const body = (await request.json()) as {
      apiKey?: string;
      appKey?: string;
      site?: string;
    };

    if (!body.apiKey || !body.appKey || !body.site) {
      return NextResponse.json(
        { message: "apiKey, appKey, and site are required" },
        { status: 400 },
      );
    }

    let site: DatadogSite;
    try {
      site = normalizeSite(body.site);
    } catch (err) {
      return NextResponse.json(
        {
          message:
            err instanceof Error
              ? err.message
              : `Unsupported site. Use one of: ${SUPPORTED_SITES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const validation = await validateCredentials({
      apiKey: body.apiKey.trim(),
      appKey: body.appKey.trim(),
      site,
    });

    if (!validation.ok) {
      return NextResponse.json(
        {
          message:
            validation.errorDetail ??
            "Datadog rejected the credentials. Verify the API key, application key, and site.",
          datadogStatus: validation.status,
        },
        { status: 400 },
      );
    }

    let encrypted: string;
    try {
      encrypted = await encryptCredentials({
        apiKey: body.apiKey.trim(),
        appKey: body.appKey.trim(),
        site,
      });
    } catch (err) {
      logger.error("encrypt failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        {
          message:
            "Server is missing INTEGRATIONS_ENCRYPTION_KEY. Contact your administrator.",
        },
        { status: 500 },
      );
    }

    const config = {
      site,
      apiKeyMask: maskSecret(body.apiKey.trim()),
    };

    const { error: upsertError } = await supabaseAdmin
      .from("org_integrations")
      .upsert(
        {
          organization_id: organizationId,
          provider: "datadog",
          status: "active",
          credentials_encrypted: encrypted,
          config,
          last_error: null,
        },
        { onConflict: "organization_id,provider" },
      );

    if (upsertError) {
      logger.error("integration upsert failed", { error: upsertError.message });
      return NextResponse.json(
        { message: "Failed to save integration" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      status: "active",
      site,
      apiKeyMask: config.apiKeyMask,
    });
  } catch (err) {
    logger.error("integration POST threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { organizationId, provider } = await params;
    if (!SUPPORTED_PROVIDERS.has(provider)) {
      return NextResponse.json(
        { message: "Unknown provider" },
        { status: 404 },
      );
    }

    const auth = await authorize(request, organizationId);
    if (auth instanceof NextResponse) return auth;

    // Mark disconnected but preserve historical data (per #15 AC).
    // Wipe the credential bytes so a future re-connect requires a fresh
    // ping; keep config so the UI can show "previously connected".
    const { error } = await supabaseAdmin
      .from("org_integrations")
      .update({
        status: "disconnected",
        credentials_encrypted: null,
        last_error: null,
      })
      .eq("organization_id", organizationId)
      .eq("provider", provider);

    if (error) {
      logger.error("integration DELETE failed", { error: error.message });
      return NextResponse.json(
        { message: "Failed to disconnect integration" },
        { status: 500 },
      );
    }

    return NextResponse.json({ status: "disconnected" });
  } catch (err) {
    logger.error("integration DELETE threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}
