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
  const { organization_id, name } = body;

  if (!organization_id || !name) {
    return Response.json(
      { error: "organization_id and name are required" },
      { status: 400 },
    );
  }

  // Verify user is member of this org
  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("user_id", session.user.id)
    .eq("organization_id", organization_id)
    .single();

  if (!membership || membership.role === "member") {
    return Response.json(
      { error: "Insufficient permissions" },
      { status: 403 },
    );
  }

  const { raw, hash, prefix } = await generateToken();

  const { error } = await supabaseAdmin.from("api_tokens").insert({
    organization_id,
    name,
    token_hash: hash,
    token_prefix: prefix,
    created_by: session.user.id,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Return raw token — shown only once
  return Response.json({ token: raw }, { status: 201 });
}
