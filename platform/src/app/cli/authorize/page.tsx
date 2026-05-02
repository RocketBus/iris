import { redirect } from "next/navigation";

import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";

import { AuthorizeForm } from "./authorize-form";

import { ApertureMark } from "@/components/brand/ApertureMark";
import { authOptions } from "@/lib/auth";
import { getServerTranslation } from "@/lib/server-translation";
import { supabaseAdmin } from "@/lib/supabase";


export const metadata: Metadata = {
  title: "Authorize CLI",
  robots: { index: false, follow: false },
};

type SessionUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
  organizations?: { id: string; name: string; slug: string; role?: string }[];
};

export default async function CliAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<{ port?: string; state?: string }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    const params = await searchParams;
    const returnUrl = `/cli/authorize?port=${params.port || ""}&state=${params.state || ""}`;
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(returnUrl)}`);
  }

  const params = await searchParams;
  const port = params.port;
  const state = params.state;
  const { t } = await getServerTranslation();

  if (!port || !state) {
    const body = t('cliAuthorize.invalidRequest.body', {
      cmd: '__IRIS_LOGIN__',
    });
    const [before, after] = body.split('__IRIS_LOGIN__');
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-md rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="text-xl font-bold text-destructive">{t('cliAuthorize.invalidRequest.title')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {before}
            <code className="font-mono text-primary">iris login</code>
            {after}
          </p>
        </div>
      </div>
    );
  }

  // Get user's organizations
  const sessionUser = session.user as SessionUser;
  const userId = sessionUser.id;

  const { data: memberships } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .eq("status", "active");

  const orgIds = (memberships || []).map((m) => m.organization_id);

  const { data: organizations } = orgIds.length > 0
    ? await supabaseAdmin
        .from("organizations")
        .select("id, name, slug")
        .in("id", orgIds)
    : { data: [] };

  const orgs = (organizations || []).map((org) => {
    const membership = memberships?.find((m) => m.organization_id === org.id);
    return { ...org, role: membership?.role || "member" };
  });

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2">
            <ApertureMark className="size-6 text-primary" />
            <span className="text-lg font-semibold tracking-tight">Iris</span>
          </div>
          <h1 className="mt-2 text-xl font-semibold">{t('cliAuthorize.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('cliAuthorize.subtitle')}</p>
        </div>

        {orgs.length === 0 ? (
          <div className="rounded-md border border-border p-4 text-center text-sm text-muted-foreground">
            {t('cliAuthorize.noOrgs')}
          </div>
        ) : (
          <AuthorizeForm organizations={orgs} port={port} state={state} />
        )}

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {t('cliAuthorize.footnote')}
        </p>
      </div>
    </div>
  );
}
