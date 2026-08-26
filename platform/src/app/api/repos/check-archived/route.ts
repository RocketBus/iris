import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { logError } from "@/lib/debug";
import { checkArchivedStatus } from "@/lib/github";

/**
 * On-demand, ephemeral archived-status check for a set of repos — nothing
 * here is persisted. Meant to be called for whatever repos are currently
 * rendered on a page, not as a full-org background sync.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const accessToken = (session.user as { githubAccessToken?: string })
    .githubAccessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "no_github_link" }, { status: 412 });
  }

  const body = await request.json().catch(() => null);
  const remoteUrls = Array.isArray(body?.remoteUrls)
    ? body.remoteUrls.filter((v: unknown): v is string => typeof v === "string")
    : [];

  try {
    const archived = await checkArchivedStatus(remoteUrls, accessToken);
    return NextResponse.json({ archived });
  } catch (error) {
    logError(error, "POST /api/repos/check-archived");
    return NextResponse.json({ error: "github_api_error" }, { status: 502 });
  }
}
