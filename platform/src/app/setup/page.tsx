"use client";

import { useState, useEffect } from "react";

import Image from "next/image";
import { useRouter } from "next/navigation";

import { useSession } from "next-auth/react";

import { Background } from "@/components/background";
import { ApertureMark } from "@/components/brand/ApertureMark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import {
  PENDING_GITHUB_ORG_COOKIE,
  parsePendingGitHubOrg,
  type PendingGitHubOrg,
} from "@/lib/pending-github-org";
import { generateTenantSlug, isValidTenantSlug } from "@/lib/tenant-utils";

function readPendingCookie(): PendingGitHubOrg | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${PENDING_GITHUB_ORG_COOKIE}=`));
  if (!match) return null;
  return parsePendingGitHubOrg(match.split("=")[1]);
}

function clearPendingCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${PENDING_GITHUB_ORG_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export default function Setup() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    organizationName: "",
    organizationSlug: "",
  });
  const [pendingOrg, setPendingOrg] = useState<PendingGitHubOrg | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "loading") return;

    if (!session) {
      router.push("/auth/signin");
      return;
    }

    const pending = readPendingCookie();
    if (pending) {
      setPendingOrg(pending);
      setFormData({
        organizationName: pending.name || pending.login,
        organizationSlug: generateTenantSlug(pending.login),
      });
    }

    // Allow users with existing organizations to create new ones
    // Only redirect if user has no organizations and is accessing setup unintentionally
    // Users can explicitly access /setup to create additional organizations
  }, [session, status, router]);

  const handleOrganizationNameChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const name = e.target.value;
    const slug = generateTenantSlug(name);
    setFormData({
      organizationName: name,
      organizationSlug: slug,
    });
  };

  const handleOrganizationSlugChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setFormData({
      ...formData,
      organizationSlug: slug,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    // Validate organization name
    if (!formData.organizationName.trim()) {
      setError(t("setup.nameRequired"));
      setIsLoading(false);
      return;
    }

    // Validate slug
    if (
      !formData.organizationSlug ||
      !isValidTenantSlug(formData.organizationSlug)
    ) {
      setError(t("setup.slugInvalid"));
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.organizationName,
          slug: formData.organizationSlug,
          githubOrgId: pendingOrg?.id ?? null,
          githubOrgLogin: pendingOrg?.login ?? null,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        if (payload.code === "github_org_taken") {
          throw new Error(t("setup.errorGithubOrgTaken"));
        }
        throw new Error(payload.message || t("setup.error"));
      }

      // Selection consumed — clear the cookie regardless of whether we
      // created a new org or were redirected to an existing one.
      if (pendingOrg) clearPendingCookie();

      window.location.href = `/${payload.slug}/dashboard`;
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : t("setup.error"));
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <Background>
        <section className="py-28 lg:pt-44 lg:pb-32">
          <div className="container">
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
            </div>
          </div>
        </section>
      </Background>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <Background>
      <section className="py-28 lg:pt-44 lg:pb-32">
        <div className="container">
          <div className="flex flex-col gap-4">
            <Card className="mx-auto w-full max-w-md">
              <CardHeader className="flex flex-col items-center space-y-0">
                <div className="mb-7 flex items-center gap-2">
                  <ApertureMark className="size-5 text-primary" />
                  <span className="text-sm font-semibold tracking-tight">
                    Iris
                  </span>
                </div>
                <CardTitle className="text-2xl font-bold">
                  {t("setup.title")}
                </CardTitle>
                <p className="text-muted-foreground text-center">
                  {t("setup.description")}
                </p>
              </CardHeader>
              <CardContent>
                {pendingOrg && (
                  <div className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
                    <p className="font-medium">
                      {t("setupLinked.mirroring", { login: pendingOrg.login })}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <button
                        type="button"
                        onClick={() => router.push("/auth/select-github-org")}
                        className="text-primary hover:underline"
                      >
                        {t("setupLinked.changeChoice")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          clearPendingCookie();
                          setPendingOrg(null);
                          setFormData({
                            organizationName: "",
                            organizationSlug: "",
                          });
                        }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {t("setupLinked.unlink")}
                      </button>
                    </div>
                  </div>
                )}
                <form onSubmit={handleSubmit} className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="organizationName">
                      {t("setup.organizationName")}
                    </Label>
                    <Input
                      id="organizationName"
                      type="text"
                      placeholder={t("setup.organizationNamePlaceholder")}
                      value={formData.organizationName}
                      onChange={handleOrganizationNameChange}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="organizationSlug">
                      {t("setup.organizationSlug")}
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        app.com/
                      </span>
                      <Input
                        id="organizationSlug"
                        type="text"
                        placeholder={t("setup.organizationSlugPlaceholder")}
                        value={formData.organizationSlug}
                        onChange={handleOrganizationSlugChange}
                        required
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("setup.organizationSlugDescription")}
                    </p>
                  </div>
                  {error && <p className="text-sm text-red-500">{error}</p>}
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? t("setup.creating") : t("setup.createButton")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </Background>
  );
}
