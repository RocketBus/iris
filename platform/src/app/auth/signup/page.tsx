"use client";

import { Suspense, useState, useEffect } from "react";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { signIn } from "next-auth/react";
import { FaGithub } from "react-icons/fa6";
import { FcGoogle } from "react-icons/fc";

import { acceptInvitationAction } from "@/actions/team-actions";
import { Background } from "@/components/background";
import { ApertureMark } from "@/components/brand/ApertureMark";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBrowserTranslation } from "@/hooks/useBrowserTranslation";

function SignUpContent() {
  const { t } = useBrowserTranslation();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [githubEnabled, setGithubEnabled] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  // Check available auth providers
  useEffect(() => {
    fetch("/api/auth/available-providers")
      .then((res) => res.json())
      .then((data) => {
        setGoogleEnabled(data.providers?.google || false);
        setGithubEnabled(data.providers?.github || false);
      })
      .catch(() => {
        // Silently fail - OAuth buttons won't show
        setGoogleEnabled(false);
        setGithubEnabled(false);
      });
  }, []);

  // Pre-fill email if coming from invitation
  useEffect(() => {
    if (inviteToken) {
      // We could fetch invitation details to pre-fill email, but for now we'll just show a message
      setSuccess(t("auth.signup.inviteMessage"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteToken]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccess("");

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError(t("auth.signup.passwordMismatch"));
      setIsLoading(false);
      return;
    }

    // Validate password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
    if (
      !passwordRegex.test(formData.password) ||
      formData.password.length < 8
    ) {
      setError(t("auth.signup.weakPassword"));
      setIsLoading(false);
      return;
    }

    try {
      // Create user account (this would typically be done via API)
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          inviteToken: inviteToken ?? undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || t("auth.signup.error"));
      }

      await response.json();

      // If user came from invitation, auto-accept it after successful signup
      if (inviteToken) {
        try {
          // Sign in the user first
          const signInResult = await signIn("credentials", {
            email: formData.email,
            password: formData.password,
            redirect: false,
          });

          if (signInResult?.ok) {
            // Accept the invitation
            const inviteResult = await acceptInvitationAction({
              token: inviteToken,
            });
            const organizationSlug = inviteResult?.data?.organizationSlug;

            if (inviteResult?.data?.success) {
              setSuccess(t("auth.signup.success"));
              // Redirect to organization dashboard
              setTimeout(() => {
                if (organizationSlug) {
                  router.push(`/${organizationSlug}/dashboard`);
                } else {
                  router.push("/dashboard");
                }
              }, 2000);
            } else {
              setSuccess(t("auth.signup.success"));
              setTimeout(() => {
                router.push("/auth/signin");
              }, 3000);
            }
          } else {
            setSuccess(t("auth.signup.success"));
            setTimeout(() => {
              router.push("/auth/signin");
            }, 3000);
          }
        } catch (inviteError) {
          console.error("Error accepting invitation:", inviteError);
          setSuccess(t("auth.signup.success"));
          setTimeout(() => {
            router.push("/auth/signin");
          }, 3000);
        }
      } else {
        // Normal signup flow
        setSuccess(t("auth.signup.success"));
        setTimeout(() => {
          router.push("/auth/signin");
        }, 3000);
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : t("auth.signup.error"));
    } finally {
      setIsLoading(false);
    }
  };

  const buildOAuthCallback = () =>
    inviteToken
      ? `/auth/post-login?invite=${encodeURIComponent(inviteToken)}`
      : "/auth/post-login";

  const handleGoogleSignUp = async () => {
    setIsLoading(true);
    setError("");
    try {
      await signIn("google", { callbackUrl: buildOAuthCallback() });
    } catch (error) {
      console.error("Google sign up exception:", error);
      setError(t("auth.signup.error"));
      setIsLoading(false);
    }
  };

  const handleGitHubSignUp = async () => {
    setIsLoading(true);
    setError("");
    try {
      await signIn("github", { callbackUrl: buildOAuthCallback() });
    } catch (error) {
      console.error("GitHub sign up exception:", error);
      setError(t("auth.signup.error"));
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
                  {t("auth.signup.title")}
                </p>
                <p className="text-muted-foreground">
                  {t("auth.signup.subtitle")}
                </p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">{t("auth.signup.name")}</Label>
                    <Input
                      id="name"
                      name="name"
                      type="text"
                      placeholder={t("auth.signup.namePlaceholder")}
                      value={formData.name}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">{t("auth.signup.email")}</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder={t("auth.signup.emailPlaceholder")}
                      value={formData.email}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">
                      {t("auth.signup.password")}
                    </Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder={t("auth.signup.passwordPlaceholder")}
                      value={formData.password}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="confirmPassword">
                      {t("auth.signup.confirmPassword")}
                    </Label>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      placeholder={t("auth.signup.confirmPasswordPlaceholder")}
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  {success && (
                    <Alert>
                      <AlertDescription>{success}</AlertDescription>
                    </Alert>
                  )}
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <Button
                    type="submit"
                    className="mt-2 w-full"
                    disabled={isLoading}
                  >
                    {isLoading
                      ? t("auth.signup.signingUp")
                      : t("auth.signup.signUpButton")}
                  </Button>
                  {googleEnabled && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={handleGoogleSignUp}
                      disabled={isLoading}
                    >
                      <FcGoogle className="mr-2 size-5" />
                      {t("auth.signup.signUpWithGoogle")}
                    </Button>
                  )}
                  {githubEnabled && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={handleGitHubSignUp}
                      disabled={isLoading}
                    >
                      <FaGithub className="mr-2 size-5" />
                      {t("auth.signup.signUpWithGitHub")}
                    </Button>
                  )}
                </form>
                <div className="text-muted-foreground mx-auto mt-8 flex justify-center gap-1 text-sm">
                  <p>{t("auth.signup.alreadyHaveAccount")}</p>
                  <Link
                    href="/auth/signin"
                    className="text-primary font-medium"
                  >
                    {t("auth.signup.signIn")}
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </Background>
  );
}

function SignUpLoading() {
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

export default function SignUp() {
  return (
    <Suspense fallback={<SignUpLoading />}>
      <SignUpContent />
    </Suspense>
  );
}
