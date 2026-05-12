"use client";

import { Suspense, useState, useEffect } from "react";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { signIn } from "next-auth/react";
import { FaGithub } from "react-icons/fa6";
import { FcGoogle } from "react-icons/fc";

import { Background } from "@/components/background";
import { ApertureMark } from "@/components/brand/ApertureMark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBrowserTranslation } from "@/hooks/useBrowserTranslation";

function SignInContent() {
  const { t } = useBrowserTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [githubEnabled, setGithubEnabled] = useState(false);
  const [passwordAuthEnabled, setPasswordAuthEnabled] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const rawCallbackUrl = searchParams.get("callbackUrl");
  const callbackUrl =
    rawCallbackUrl &&
    rawCallbackUrl.startsWith("/") &&
    !rawCallbackUrl.startsWith("//")
      ? rawCallbackUrl
      : null;

  // Check available auth providers
  useEffect(() => {
    fetch("/api/auth/available-providers")
      .then((res) => res.json())
      .then((data) => {
        setGoogleEnabled(data.providers?.google || false);
        setGithubEnabled(data.providers?.github || false);
        setPasswordAuthEnabled(data.providers?.passwordAuth || false);
      })
      .catch(() => {
        // Silently fail - OAuth buttons won't show
        setGoogleEnabled(false);
        setGithubEnabled(false);
        setPasswordAuthEnabled(false);
      });

    // Check for OAuth errors in URL
    const errorParam = searchParams.get("error");
    if (errorParam === "google" || errorParam === "OAuthSignin") {
      // Fetch debug info to show helpful error message
      fetch("/api/auth/debug")
        .then((res) => res.json())
        .then((debugInfo) => {
          const { googleOAuth, nextAuth } = debugInfo;
          const baseUrl = nextAuth.url
            .replace("/api/auth/callback/google", "")
            .replace("NOT SET", "http://localhost:3000");
          let errorMsg = "Google authentication failed.\n\n";

          if (!googleOAuth.configured) {
            errorMsg += "❌ Google OAuth is not configured:\n";
            if (!googleOAuth.hasClientId)
              errorMsg += "  - GOOGLE_CLIENT_ID is missing\n";
            if (!googleOAuth.hasClientSecret)
              errorMsg += "  - GOOGLE_CLIENT_SECRET is missing\n";
          } else {
            errorMsg += "✅ Google OAuth is configured\n";
          }

          errorMsg += "\n📋 Please verify in Google Cloud Console:\n\n";
          errorMsg +=
            "1. Go to: APIs & Services → Credentials → Your OAuth 2.0 Client ID\n\n";
          errorMsg += '2. Under "Authorized JavaScript origins", add:\n';
          errorMsg += `   → ${baseUrl}\n`;
          errorMsg +=
            "   ⚠️ IMPORTANT: No trailing slash, no path, just the origin!\n\n";
          errorMsg += '3. Under "Authorized redirect URIs", add:\n';
          errorMsg += `   → ${nextAuth.expectedCallbackUrl}\n\n`;
          errorMsg += '4. Application type must be: "Web application"\n\n';
          errorMsg += '5. Click "SAVE" at the bottom of the page\n\n';
          errorMsg += "6. Wait 2-5 minutes for Google to propagate changes\n\n";
          errorMsg +=
            "7. Check server logs (terminal) for detailed error messages\n\n";
          errorMsg += "💡 Common issues:\n";
          errorMsg +=
            "   - JavaScript origins must be exact origin (no trailing slash)\n";
          errorMsg += "   - Redirect URI must match exactly (case-sensitive)\n";
          errorMsg += "   - Changes may take a few minutes to take effect";

          setError(errorMsg);
        })
        .catch(() => {
          setError(
            "Google authentication failed. Please check your configuration and server logs.",
          );
        });
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        // Check if 2FA is required
        if (result.error.startsWith("Requires2FA:")) {
          const parts = result.error.split(":");
          const method = parts[1]; // 'totp' or 'email'
          const userId = parts[2];
          const userEmail = parts[3];

          // Redirect to 2FA verification page
          router.push(
            `/auth/verify-2fa?method=${method}&userId=${userId}&email=${encodeURIComponent(userEmail)}`,
          );
          return;
        } else if (result.error.includes("verify your email")) {
          setError(t("auth.signin.emailNotVerified"));
        } else if (result.error.includes("locked")) {
          setError(t("auth.signin.accountLocked"));
        } else {
          setError(t("auth.signin.invalidCredentials"));
        }
      } else {
        // Wait a moment for the session to be established
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Honor callbackUrl (e.g. CLI authorize flow) before dashboard redirect
        if (callbackUrl) {
          window.location.href = callbackUrl;
          return;
        }

        // Fetch organizations directly from API to avoid session cache issues
        try {
          const orgResponse = await fetch("/api/auth/get-user-orgs", {
            method: "GET",
            credentials: "include",
          });

          if (orgResponse.ok) {
            const { organizations } = await orgResponse.json();

            if (organizations && organizations.length > 0) {
              // If user came from invitation, redirect to accept invite first
              if (inviteToken) {
                window.location.href = `/accept-invite?token=${inviteToken}`;
                return;
              } else {
                // Redirect to first organization dashboard
                const firstOrg = organizations[0];
                window.location.href = `/${firstOrg.slug}/dashboard`;
                return;
              }
            }
          }
        } catch (error) {
          console.error("Error fetching organizations:", error);
        }

        // If no organizations found or error, redirect to setup
        if (inviteToken) {
          window.location.href = `/accept-invite?token=${inviteToken}`;
        } else {
          window.location.href = "/setup";
        }
      }
    } catch {
      setError(t("auth.signin.error"));
    } finally {
      setIsLoading(false);
    }
  };

  const buildOAuthCallback = () => {
    const postLoginParams = new URLSearchParams();
    if (inviteToken) postLoginParams.set("invite", inviteToken);
    if (callbackUrl) postLoginParams.set("redirect", callbackUrl);
    const qs = postLoginParams.toString();
    return qs ? `/auth/post-login?${qs}` : "/auth/post-login";
  };

  const handleGoogleSignIn = async () => {
    if (!googleEnabled) {
      setError(
        "Google authentication is not available. Please check your configuration.",
      );
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      await signIn("google", { callbackUrl: buildOAuthCallback() });
    } catch (error) {
      console.error("Google sign in exception:", error);
      setError(t("auth.signin.googleError"));
      setIsLoading(false);
    }
  };

  const handleGitHubSignIn = async () => {
    if (!githubEnabled) {
      setError(t("auth.signin.gitHubError"));
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      await signIn("github", { callbackUrl: buildOAuthCallback() });
    } catch (error) {
      console.error("GitHub sign in exception:", error);
      setError(t("auth.signin.gitHubError"));
      setIsLoading(false);
    }
  };

  return (
    <Background>
      <section className="py-28 lg:pt-44 lg:pb-32">
        <div className="container">
          <div className="flex flex-col gap-4">
            <Card className="mx-auto w-full max-w-sm">
              <CardHeader className="flex flex-col items-center space-y-0">
                <div className="mb-7 flex items-center gap-2">
                  <ApertureMark className="size-5 text-primary" />
                  <span className="text-sm font-semibold tracking-tight">
                    Iris
                  </span>
                </div>
                <p className="mb-2 text-2xl font-bold">
                  {t("auth.signin.title")}
                </p>
                <p className="text-muted-foreground">
                  {t("auth.signin.subtitle")}
                </p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="grid gap-4">
                  {passwordAuthEnabled && (
                    <>
                      <div className="grid gap-2">
                        <Label htmlFor="email">{t("auth.signin.email")}</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder={t("auth.signin.emailPlaceholder")}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="password">
                          {t("auth.signin.password")}
                        </Label>
                        <Input
                          id="password"
                          type="password"
                          placeholder={t("auth.signin.passwordPlaceholder")}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />
                      </div>
                      <div className="flex justify-between">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="remember"
                            checked={rememberMe}
                            onCheckedChange={(checked) =>
                              setRememberMe(checked === true)
                            }
                            className="border-muted-foreground"
                          />
                          <label
                            htmlFor="remember"
                            className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            {t("auth.signin.rememberMe")}
                          </label>
                        </div>
                        <Link
                          href="/auth/forgot-password"
                          className="text-primary text-sm font-medium"
                        >
                          {t("auth.signin.forgotPassword")}
                        </Link>
                      </div>
                      {error && (
                        <div className="text-sm text-red-500">
                          <p>{error}</p>
                          {error.includes("verify your email") && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const response = await fetch(
                                    "/api/auth/resend-verification",
                                    {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify({ email }),
                                    },
                                  );
                                  const data = await response.json();
                                  if (response.ok) {
                                    setError(t("auth.signin.verificationSent"));
                                  } else {
                                    setError(
                                      data.message ||
                                        t("auth.signin.resendError"),
                                    );
                                  }
                                } catch {
                                  setError(t("auth.signin.resendError"));
                                }
                              }}
                              className="text-primary hover:underline mt-1"
                            >
                              {t("auth.signin.resendVerification")}
                            </button>
                          )}
                        </div>
                      )}
                      <Button
                        type="submit"
                        className="mt-2 w-full"
                        disabled={isLoading}
                      >
                        {isLoading
                          ? t("auth.signin.signingIn")
                          : t("auth.signin.signInButton")}
                      </Button>
                    </>
                  )}
                  {googleEnabled && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={handleGoogleSignIn}
                      disabled={isLoading}
                    >
                      <FcGoogle className="mr-2 size-5" />
                      {t("auth.signin.signInWithGoogle")}
                    </Button>
                  )}
                  {githubEnabled && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={handleGitHubSignIn}
                      disabled={isLoading}
                    >
                      <FaGithub className="mr-2 size-5" />
                      {t("auth.signin.signInWithGitHub")}
                    </Button>
                  )}
                </form>
                {passwordAuthEnabled && (
                  <div className="text-muted-foreground mx-auto mt-8 flex justify-center gap-1 text-sm">
                    <p>{t("auth.signin.noAccount")}</p>
                    <Link
                      href="/auth/signup"
                      className="text-primary font-medium"
                    >
                      {t("auth.signin.signUp")}
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </Background>
  );
}

function SignInLoading() {
  const { t } = useBrowserTranslation();
  return (
    <Background>
      <section className="py-28 lg:pt-44 lg:pb-32">
        <div className="container">
          <div className="flex justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-6" />
              <p className="text-sm text-muted-foreground">
                {t("common.loading")}
              </p>
            </div>
          </div>
        </div>
      </section>
    </Background>
  );
}

export default function SignIn() {
  return (
    <Suspense fallback={<SignInLoading />}>
      <SignInContent />
    </Suspense>
  );
}
