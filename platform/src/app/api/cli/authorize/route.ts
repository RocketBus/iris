import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { generateToken } from "@/lib/tokens";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { organization_id, port, state } = body;

  if (!organization_id || !port || !state) {
    return Response.json(
      { error: "organization_id, port, and state are required" },
      { status: 400 },
    );
  }

  // Validate port is a reasonable number
  const portNum = parseInt(port, 10);
  if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
    return Response.json({ error: "Invalid port" }, { status: 400 });
  }

  // Verify user is member of this org
  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role, organization_id")
    .eq("user_id", session.user.id)
    .eq("organization_id", organization_id)
    .single();

  if (!membership) {
    return Response.json(
      { error: "Not a member of this organization" },
      { status: 403 },
    );
  }

  // Get org slug
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("slug")
    .eq("id", organization_id)
    .single();

  if (!org) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }

  // Create API token
  const { raw, hash, prefix } = await generateToken();
  const tokenName = `CLI login — ${new Date().toISOString().slice(0, 10)}`;

  const { error } = await supabaseAdmin.from("api_tokens").insert({
    organization_id,
    name: tokenName,
    token_hash: hash,
    token_prefix: prefix,
    created_by: session.user.id,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Use the public app URL (not the internal request URL which may be 0.0.0.0 in Docker)
  const serverUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";

  // Build redirect URL back to CLI's local server
  const callbackParams = new URLSearchParams({
    token: raw,
    org: org.slug,
    server: serverUrl,
    state,
  });
  const redirectUrl = `http://localhost:${portNum}/callback?${callbackParams.toString()}`;

  return Response.json({ redirect_url: redirectUrl }, { status: 201 });
}
