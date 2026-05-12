"use client";

import { Suspense, useEffect } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { useSession } from "next-auth/react";

import { Background } from "@/components/background";
import { useBrowserTranslation } from "@/hooks/useBrowserTranslation";

function PostLoginContent() {
  const { t } = useBrowserTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;

    if (!session) {
      router.replace("/auth/signin");
      return;
    }

    const inviteToken = searchParams?.get("invite");
    const redirectTo = searchParams?.get("redirect");

    if (inviteToken) {
      router.replace(`/accept-invite?token=${encodeURIComponent(inviteToken)}`);
      return;
    }

    if (redirectTo) {
      const isFullUrl = /^https?:\/\//i.test(redirectTo);
      const target = isFullUrl
        ? redirectTo
        : `${redirectTo.startsWith("/") ? "" : "/"}${redirectTo}`;
      router.replace(target);
      return;
    }

    const finalizeLogin = async () => {
      // If the user's GitHub orgs overlap with an Iris workspace's linked
      // GitHub org, auto-add them as a member before resolving the redirect.
      // This makes the natural target the workspace dashboard rather than the
      // create-org screen. Failure is non-fatal — the existing get-user-orgs
      // + fallback chain below still works.
      const githubAccessToken = (
        session?.user as { githubAccessToken?: string } | undefined
      )?.githubAccessToken;
      if (githubAccessToken) {
        try {
          await fetch("/api/auth/auto-join-github-orgs", {
            method: "POST",
            credentials: "include",
          });
        } catch (error) {
          console.error("Auto-join via GitHub failed:", error);
        }
      }

      let target = "/setup";
      let hasOrgs = false;
      try {
        const response = await fetch("/api/auth/get-user-orgs", {
          method: "GET",
          credentials: "include",
        });

        if (response.ok) {
          const { organizations } = await response.json();

          if (Array.isArray(organizations) && organizations.length > 0) {
            hasOrgs = true;
            target = `/${organizations[0].slug}/dashboard`;
          }
        }
      } catch (error) {
        console.error("Failed to resolve post-login redirect:", error);
      }

      // No overlap with an existing workspace and no Iris org yet: a fresh
      // GitHub login gets the org selector, not the manual setup form. The
      // selector itself falls back to /setup if the user has no GitHub orgs.
      if (!hasOrgs && githubAccessToken && target === "/setup") {
        target = "/auth/select-github-org";
      }

      const dismissed = Boolean(
        (
          session?.user as
            | { preferences?: { welcome_dismissed?: unknown } }
            | undefined
        )?.preferences?.welcome_dismissed,
      );

      if (dismissed) {
        router.replace(target);
      } else {
        router.replace(`/welcome?next=${encodeURIComponent(target)}`);
      }
    };

    finalizeLogin();
  }, [session, status, router, searchParams]);

  return (
    <Background>
      <section className="py-28 lg:pt-44 lg:pb-32">
        <div className="container">
          <div className="flex justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-6" />
              <p className="text-sm text-muted-foreground">
                {t("auth.postLogin.preparing")}
              </p>
            </div>
          </div>
        </div>
      </section>
    </Background>
  );
}

function PostLoginLoading() {
  const { t } = useBrowserTranslation();
  return (
    <Background>
      <section className="py-28 lg:pt-44 lg:pb-32">
        <div className="container">
          <div className="flex justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-6" />
              <p className="text-sm text-muted-foreground">
                {t("auth.postLogin.preparing")}
              </p>
            </div>
          </div>
        </div>
      </section>
    </Background>
  );
}

export default function PostLoginPage() {
  return (
    <Suspense fallback={<PostLoginLoading />}>
      <PostLoginContent />
    </Suspense>
  );
}
