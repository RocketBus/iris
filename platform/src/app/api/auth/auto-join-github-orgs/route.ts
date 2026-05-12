import { NextResponse } from "next/server";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { logError } from "@/lib/debug";
import { listUserOrgs } from "@/lib/github";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * For each GitHub org the signed-in user belongs to, check whether an
 * Iris workspace is linked to that org (organizations.github_org_id) and
 * add the user as a `member` if no membership row exists yet. Membership
 * rows in any other status (`suspended`, `pending`) are respected — we
 * never overwrite admin intent or in-flight invitations.
 *
 * Called from the post-login finalizer right before /api/auth/get-user-orgs,
 * so a first-time GitHub login that overlaps with a pre-existing workspace
 * lands the user directly in that workspace's dashboard instead of the
 * manual create-org form.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const accessToken = (session.user as { githubAccessToken?: string })
    .githubAccessToken;
  if (!accessToken) {
    return NextResponse.json({ joined: [] });
  }

  try {
    const githubOrgs = await listUserOrgs(accessToken);
    if (githubOrgs.length === 0) {
      return NextResponse.json({ joined: [] });
    }

    const githubOrgIds = githubOrgs.map((o) => o.id);

    const { data: linkedOrgs, error: lookupError } = await supabaseAdmin
      .from("organizations")
      .select("id, slug, name, github_org_id, github_org_login")
      .in("github_org_id", githubOrgIds);

    if (lookupError) {
      logError(lookupError, "auto-join-github-orgs: lookup");
      return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
    }

    if (!linkedOrgs || linkedOrgs.length === 0) {
      return NextResponse.json({ joined: [] });
    }

    const joined: Array<{ id: string; slug: string; name: string }> = [];

    for (const org of linkedOrgs) {
      const { data: existing } = await supabaseAdmin
        .from("organization_members")
        .select("id, status")
        .eq("user_id", session.user.id)
        .eq("organization_id", org.id)
        .maybeSingle();

      if (existing) continue;

      const { error: insertError } = await supabaseAdmin
        .from("organization_members")
        .insert({
          user_id: session.user.id,
          organization_id: org.id,
          role: "member",
          status: "active",
        });

      if (insertError) {
        logError(insertError, `auto-join-github-orgs: insert org=${org.id}`);
        continue;
      }

      joined.push({ id: org.id, slug: org.slug, name: org.name });
    }

    return NextResponse.json({ joined });
  } catch (error) {
    logError(error, "auto-join-github-orgs");
    return NextResponse.json({ error: "unexpected" }, { status: 500 });
  }
}
