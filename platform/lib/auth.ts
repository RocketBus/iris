import bcrypt from "bcryptjs";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { v4 as uuidv4 } from "uuid";

import { logAuditEvent } from "./audit-logger";
import {
  debugAuth,
  debugDatabase,
  logger,
  logError,
  RequestTimer,
} from "./debug";
import { getEmailDomain, isPersonalEmailDomain } from "./email-domain";
import { env } from "./env";
import { isFeatureEnabled } from "./features";
import { supabaseAdmin } from "./supabase";

// Email + password is gated behind a feature flag. Off by default — Iris
// deployments rely on OAuth. Operators enable via FEATURES__PASSWORD_AUTH=true.
const isPasswordAuthEnabled = isFeatureEnabled("passwordAuth");

// For now, let's use JWT strategy instead of database sessions
// Database sessions require a proper adapter implementation

// Check if Google OAuth is configured
const isGoogleOAuthConfigured = !!(
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
);

if (isGoogleOAuthConfigured) {
  debugAuth("Google OAuth is configured", {
    hasClientId: !!env.GOOGLE_CLIENT_ID,
    hasClientSecret: !!env.GOOGLE_CLIENT_SECRET,
    clientIdLength: env.GOOGLE_CLIENT_ID?.length || 0,
    nextAuthUrl: env.NEXTAUTH_URL,
    expectedCallbackUrl: `${env.NEXTAUTH_URL}/api/auth/callback/google`,
  });
} else {
  debugAuth("Google OAuth is NOT configured", {
    hasClientId: !!env.GOOGLE_CLIENT_ID,
    hasClientSecret: !!env.GOOGLE_CLIENT_SECRET,
  });
}

// Check if GitHub OAuth is configured
const isGitHubOAuthConfigured = !!(
  env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
);

if (isGitHubOAuthConfigured) {
  debugAuth("GitHub OAuth is configured", {
    hasClientId: !!env.GITHUB_CLIENT_ID,
    hasClientSecret: !!env.GITHUB_CLIENT_SECRET,
    clientIdLength: env.GITHUB_CLIENT_ID?.length || 0,
    nextAuthUrl: env.NEXTAUTH_URL,
    expectedCallbackUrl: `${env.NEXTAUTH_URL}/api/auth/callback/github`,
  });
} else {
  debugAuth("GitHub OAuth is NOT configured", {
    hasClientId: !!env.GITHUB_CLIENT_ID,
    hasClientSecret: !!env.GITHUB_CLIENT_SECRET,
  });
}

export const authOptions = {
  providers: [
    // Google OAuth Provider (optional)
    ...(isGoogleOAuthConfigured
      ? [
          GoogleProvider({
            clientId: env.GOOGLE_CLIENT_ID!,
            clientSecret: env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),

    // GitHub OAuth Provider (optional). The read:org scope is required so we
    // can list the user's GitHub orgs during onboarding.
    ...(isGitHubOAuthConfigured
      ? [
          GitHubProvider({
            clientId: env.GITHUB_CLIENT_ID!,
            clientSecret: env.GITHUB_CLIENT_SECRET!,
            authorization: {
              params: { scope: "read:user user:email read:org" },
            },
          }),
        ]
      : []),

    // Credentials Provider for email/password — gated by the passwordAuth
    // feature flag. When off, this entire provider is omitted so direct POSTs
    // to /api/auth/callback/credentials get rejected by NextAuth as unknown.
    ...(isPasswordAuthEnabled
      ? [
          CredentialsProvider({
            name: "credentials",
            credentials: {
              email: { label: "Email", type: "email" },
              password: { label: "Password", type: "password" },
              loginToken: { label: "Login Token", type: "text" },
            },
            async authorize(credentials) {
              // Check if loginToken is provided (for 2FA completion)
              if (credentials?.loginToken) {
                try {
                  // Validate login token
                  const { data: tokenData, error: tokenError } =
                    await supabaseAdmin
                      .from("two_factor_codes")
                      .select("user_id, expires_at, used")
                      .eq("code", credentials.loginToken)
                      .eq("used", false)
                      .gt("expires_at", new Date().toISOString())
                      .order("created_at", { ascending: false })
                      .limit(1)
                      .single();

                  if (tokenError || !tokenData) {
                    return null;
                  }

                  // Get user from database
                  const { data: user, error: userError } = await supabaseAdmin
                    .from("users")
                    .select("*")
                    .eq("id", tokenData.user_id)
                    .single();

                  if (userError || !user) {
                    return null;
                  }

                  // Check if account is locked
                  if (
                    user.locked_until &&
                    new Date(user.locked_until) > new Date()
                  ) {
                    throw new Error("AccountLocked");
                  }

                  // Mark token as used
                  await supabaseAdmin
                    .from("two_factor_codes")
                    .update({ used: true })
                    .eq("code", credentials.loginToken);

                  return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    image: user.avatar_url,
                  };
                } catch (error) {
                  logError(error, "Login token auth");
                  throw error;
                }
              }

              // Normal email/password login
              if (!credentials?.email || !credentials?.password) {
                return null;
              }

              try {
                // Get user from database
                const { data: user, error } = await supabaseAdmin
                  .from("users")
                  .select("*")
                  .eq("email", credentials.email)
                  .single();

                if (error || !user) {
                  return null;
                }

                // Check if account is locked
                if (
                  user.locked_until &&
                  new Date(user.locked_until) > new Date()
                ) {
                  throw new Error("AccountLocked");
                }

                // Check email verification
                if (!user.email_verified) {
                  throw new Error("EmailNotVerified");
                }

                // Verify password
                if (!user.password_hash) {
                  throw new Error("Invalid credentials");
                }

                const isPasswordValid = await bcrypt.compare(
                  credentials.password,
                  user.password_hash,
                );

                if (!isPasswordValid) {
                  // Increment failed login attempts
                  const failedAttempts = (user.failed_login_attempts || 0) + 1;
                  const lockUntil =
                    failedAttempts >= 5
                      ? new Date(Date.now() + 15 * 60 * 1000)
                      : null; // 15 minutes lock

                  await supabaseAdmin
                    .from("users")
                    .update({
                      failed_login_attempts: failedAttempts,
                      locked_until: lockUntil,
                    })
                    .eq("id", user.id);

                  throw new Error("Invalid credentials");
                }

                // Reset failed attempts on successful password verification
                await supabaseAdmin
                  .from("users")
                  .update({
                    failed_login_attempts: 0,
                    locked_until: null,
                  })
                  .eq("id", user.id);

                // Check if 2FA is required
                if (user.mfa_enabled && user.mfa_secret) {
                  // User has 2FA enabled - require TOTP verification
                  throw new Error(`Requires2FA:totp:${user.id}:${user.email}`);
                }

                // Update last login timestamp
                await supabaseAdmin
                  .from("users")
                  .update({ last_login_at: new Date().toISOString() })
                  .eq("id", user.id);

                return {
                  id: user.id,
                  email: user.email,
                  name: user.name,
                  image: user.avatar_url,
                };
              } catch (error) {
                logError(error, "authorize");
                throw error;
              }
            },
          }),
        ]
      : []),
  ],

  callbacks: {
    async signIn({
      user,
      account,
      profile,
    }: {
      user: any;
      account: any;
      profile?: any;
    }) {
      // This callback is called before the authorize function
      if (account?.provider === "google" || account?.provider === "github") {
        debugAuth(`${account.provider} OAuth signIn callback`, {
          hasUser: !!user,
          hasAccount: !!account,
          hasProfile: !!profile,
          userEmail: user?.email,
          accountType: account?.type,
          accountProvider: account?.provider,
        });
      }
      return true;
    },

    async redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
      try {
        const postLoginPath = "/auth/post-login";

        if (url.startsWith("/auth/signin")) {
          return `${baseUrl}${postLoginPath}`;
        }

        if (url.startsWith("/")) {
          return `${baseUrl}${url}`;
        }

        const parsedUrl = new URL(url);

        if (parsedUrl.origin === baseUrl) {
          return url;
        }

        return `${baseUrl}${postLoginPath}`;
      } catch (error) {
        logError(error, "redirect callback");
        return `${baseUrl}/auth/post-login`;
      }
    },

    async jwt({
      token,
      user,
      account,
      profile,
    }: {
      token: any;
      user: any;
      account: any;
      profile?: any;
    }) {
      try {
        debugAuth("JWT callback called", {
          hasToken: !!token,
          hasUser: !!user,
          hasAccount: !!account,
          tokenSub: token?.sub,
          userId: user?.id,
          accountProvider: account?.provider,
        });

        // For OAuth providers (Google), create user if doesn't exist
        if (account?.provider === "google") {
          debugAuth("Processing Google OAuth user", { email: user.email });

          const { data: existingUser, error } = await supabaseAdmin
            .from("users")
            .select("*")
            .eq("email", user.email)
            .single();

          if (error && error.code !== "PGRST116") {
            // PGRST116 = no rows returned
            logger.error("Database error fetching user for Google OAuth", {
              error: error.message,
              email: user.email,
            });
            return false;
          }

          let supabaseUser = existingUser;

          // If user doesn't exist, create them
          if (!supabaseUser) {
            debugAuth("Creating new Google OAuth user", { email: user.email });

            const { data: createdUser, error: createError } =
              await supabaseAdmin
                .from("users")
                .insert({
                  email: user.email!,
                  name: user.name,
                  avatar_url: user.image,
                  email_verified: true, // OAuth users are pre-verified
                })
                .select()
                .single();

            if (createError) {
              logger.error("Error creating Google OAuth user", {
                error: createError.message,
                email: user.email,
                code: createError.code,
              });
              return false;
            }

            if (!createdUser) {
              logger.error(
                "Failed to create Google OAuth user - no data returned",
                {
                  email: user.email,
                },
              );
              return false;
            }

            supabaseUser = createdUser;
            debugAuth("Google OAuth user created successfully", {
              userId: supabaseUser.id,
              email: supabaseUser.email,
            });
          } else {
            // User exists - check if account is locked
            if (
              supabaseUser.locked_until &&
              new Date(supabaseUser.locked_until) > new Date()
            ) {
              logger.error("Google OAuth login blocked - account is locked", {
                userId: supabaseUser.id,
                email: supabaseUser.email,
                lockedUntil: supabaseUser.locked_until,
              });
              return false;
            }

            // Update user data with latest Google information (account linking)
            const updateData: {
              name?: string;
              avatar_url?: string | null;
              email_verified?: boolean;
              failed_login_attempts?: number;
              locked_until?: null;
              last_login_at?: string;
            } = {
              email_verified: true, // Ensure email is verified for OAuth users
              failed_login_attempts: 0, // Reset failed attempts on successful OAuth login
              locked_until: null, // Unlock account if locked
              last_login_at: new Date().toISOString(),
            };

            // Update name and avatar if they differ from Google data
            if (user.name && user.name !== supabaseUser.name) {
              updateData.name = user.name;
            }

            if (user.image !== supabaseUser.avatar_url) {
              updateData.avatar_url = user.image || null;
            }

            const { error: updateError } = await supabaseAdmin
              .from("users")
              .update(updateData)
              .eq("id", supabaseUser.id);

            if (updateError) {
              logger.error("Error updating Google OAuth user data", {
                error: updateError.message,
                userId: supabaseUser.id,
                email: supabaseUser.email,
              });
              // Continue anyway - don't fail login if update fails
            } else {
              debugAuth("Google OAuth user data updated", {
                userId: supabaseUser.id,
                email: supabaseUser.email,
                updatedFields: Object.keys(updateData),
              });
            }
          }

          // Use database user ID instead of OAuth user ID
          if (supabaseUser) {
            // Ensure we keep using the Supabase user ID so OAuth and credentials accounts merge
            user.id = supabaseUser.id;
            user.name = user.name || supabaseUser.name;
            user.email = supabaseUser.email;
            user.image = supabaseUser.avatar_url || user.image;
            debugAuth("User ID set from database", {
              userId: supabaseUser.id,
              email: supabaseUser.email,
            });
          }
        }

        // GitHub OAuth flow — mirrors the Google branch above. Also captures
        // the GitHub login + access token so subsequent epic issues can call
        // the GitHub API on behalf of the user (list orgs, repos, etc.).
        if (account?.provider === "github") {
          debugAuth("Processing GitHub OAuth user", { email: user.email });

          if (!user.email) {
            logger.error("GitHub OAuth user has no email — refusing sign-in", {
              login: (account as { login?: string })?.login,
            });
            return false;
          }

          const { data: existingUser, error } = await supabaseAdmin
            .from("users")
            .select("*")
            .eq("email", user.email)
            .single();

          if (error && error.code !== "PGRST116") {
            logger.error("Database error fetching user for GitHub OAuth", {
              error: error.message,
              email: user.email,
            });
            return false;
          }

          let supabaseUser = existingUser;

          if (!supabaseUser) {
            const { data: createdUser, error: createError } =
              await supabaseAdmin
                .from("users")
                .insert({
                  email: user.email!,
                  name: user.name,
                  avatar_url: user.image,
                  email_verified: true,
                })
                .select()
                .single();

            if (createError || !createdUser) {
              logger.error("Error creating GitHub OAuth user", {
                error: createError?.message,
                email: user.email,
              });
              return false;
            }

            supabaseUser = createdUser;
            debugAuth("GitHub OAuth user created", {
              userId: supabaseUser.id,
              email: supabaseUser.email,
            });
          } else {
            if (
              supabaseUser.locked_until &&
              new Date(supabaseUser.locked_until) > new Date()
            ) {
              logger.error("GitHub OAuth login blocked - account is locked", {
                userId: supabaseUser.id,
                email: supabaseUser.email,
              });
              return false;
            }

            const updateData: {
              name?: string;
              avatar_url?: string | null;
              email_verified?: boolean;
              failed_login_attempts?: number;
              locked_until?: null;
              last_login_at?: string;
            } = {
              email_verified: true,
              failed_login_attempts: 0,
              locked_until: null,
              last_login_at: new Date().toISOString(),
            };
            if (user.name && user.name !== supabaseUser.name)
              updateData.name = user.name;
            if (user.image !== supabaseUser.avatar_url)
              updateData.avatar_url = user.image || null;

            const { error: updateError } = await supabaseAdmin
              .from("users")
              .update(updateData)
              .eq("id", supabaseUser.id);
            if (updateError) {
              logger.error("Error updating GitHub OAuth user data", {
                error: updateError.message,
                userId: supabaseUser.id,
              });
            }
          }

          if (supabaseUser) {
            user.id = supabaseUser.id;
            user.name = user.name || supabaseUser.name;
            user.email = supabaseUser.email;
            user.image = supabaseUser.avatar_url || user.image;
          }

          // Persist token + login on JWT for downstream API calls.
          const githubLogin =
            (profile as { login?: string } | undefined)?.login ??
            (account as { providerAccountId?: string } | undefined)
              ?.providerAccountId;
          token.githubAccessToken =
            (account as { access_token?: string }).access_token ?? null;
          token.githubLogin = githubLogin ?? null;
        }

        if (user) {
          debugAuth("Setting token properties", {
            userId: user.id,
            userEmail: user.email,
            tokenSub: token.sub,
          });

          token.id = user.id;
          token.sub = user.id; // Ensure sub is also set for JWT

          debugAuth("Token updated", {
            tokenId: token.id,
            tokenSub: token.sub,
          });
        }

        return token;
      } catch (error) {
        logError(error, "jwt callback");
        return false;
      }
    },

    async session({ session, token }: { session: any; token: any }) {
      debugAuth("Session callback called", {
        hasSession: !!session,
        hasToken: !!token,
        tokenSub: token?.sub,
        tokenId: token?.id,
        sessionUserEmail: session?.user?.email,
      });

      if (token.sub && session.user) {
        debugAuth("Setting session user ID", {
          tokenSub: token.sub,
          sessionUserEmail: session.user.email,
        });

        session.user.id = token.sub;

        // Surface GitHub OAuth artefacts when present (set in jwt callback).
        if (token.githubAccessToken)
          session.user.githubAccessToken = token.githubAccessToken;
        if (token.githubLogin) session.user.githubLogin = token.githubLogin;

        await ensureAutoAcceptedDomainMembership(token.sub, session.user.email);

        debugAuth("Session user ID set", {
          sessionUserId: session.user.id,
          tokenSub: token.sub,
        });

        // Get user's organizations
        const { data: organizations } = await supabaseAdmin
          .from("organization_members")
          .select(
            `
            role,
            organizations (
              id,
              name,
              slug,
              plan,
              logo_url
            )
          `,
          )
          .eq("user_id", token.sub)
          .eq("status", "active");

        session.user.organizations =
          organizations?.map((member: any) => ({
            id: member.organizations.id,
            name: member.organizations.name,
            slug: member.organizations.slug,
            plan: member.organizations.plan,
            logo_url: member.organizations.logo_url,
            role: member.role,
          })) || [];

        // Get user preferences and avatar
        const { data: userData } = await supabaseAdmin
          .from("users")
          .select("preferences, theme_preference, avatar_url")
          .eq("id", token.sub)
          .single();

        if (userData) {
          session.user.preferences = userData.preferences || {
            language: "pt-BR",
            theme: "system",
          };
          session.user.themePreference = userData.theme_preference || "system";
          session.user.image = userData.avatar_url || null; // Update image in session
        }

        debugAuth("Session updated", {
          userId: session.user.id,
          organizationsCount: session.user.organizations.length,
          sessionUserKeys: Object.keys(session.user),
          themePreference: session.user.themePreference,
        });
      } else {
        debugAuth("Session callback - no token.sub or session.user", {
          hasTokenSub: !!token?.sub,
          hasSessionUser: !!session?.user,
        });
      }

      return session;
    },
  },

  pages: {
    signIn: "/auth/signin",
  },

  events: {
    async signIn({
      user,
      account,
      profile,
      isNewUser,
    }: {
      user: any;
      account: any;
      profile?: any;
      isNewUser?: boolean;
    }) {
      if (account?.provider === "google") {
        debugAuth("Google OAuth signIn event", {
          hasUser: !!user,
          hasAccount: !!account,
          hasProfile: !!profile,
          userEmail: user?.email,
          isNewUser,
        });
      }

      await auditSignInEvent({ user, account, isNewUser });
    },
    async error(message: unknown) {
      const eventError = (message as { error?: unknown })?.error ?? message;

      logger.error("NextAuth error event", {
        name: eventError instanceof Error ? eventError.name : undefined,
        message:
          eventError instanceof Error ? eventError.message : String(eventError),
        stack: eventError instanceof Error ? eventError.stack : undefined,
      });
    },
    async signInError({
      error,
      provider,
    }: {
      error: unknown;
      provider?: string;
    }) {
      logger.error("NextAuth signIn error", {
        error: error instanceof Error ? error.message : String(error),
        provider,
        errorName: error instanceof Error ? error.name : undefined,
        errorStack: error instanceof Error ? error.stack : undefined,
      });
    },
  },

  logger: {
    error(
      code: string,
      metadata: Error | { error: Error; [key: string]: unknown },
    ) {
      logger.error("NextAuth logger error", {
        code,
        error:
          metadata instanceof Error
            ? metadata.message
            : metadata.error?.message,
      });
    },
    warn(code: string) {
      logger.warn("NextAuth logger warn", {
        code,
      });
    },
    debug(code: string, metadata: unknown) {
      logger.debug("NextAuth logger debug", {
        code,
        metadata,
      });
    },
  },

  session: {
    strategy: "jwt" as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  secret: env.NEXTAUTH_SECRET,

  // Enable debug mode to get more detailed error messages
  debug: env.NODE_ENV === "development",
};

// Helper functions for authentication

async function auditSignInEvent({
  user,
  account,
  isNewUser,
}: {
  user: { id?: string | null; email?: string | null } | null | undefined;
  account: { provider?: string | null } | null | undefined;
  isNewUser?: boolean;
}) {
  try {
    if (!user?.email) return;

    const { data: dbUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", user.email)
      .single();

    if (!dbUser?.id) return;

    const { data: memberships } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", dbUser.id)
      .eq("status", "active");

    if (!memberships || memberships.length === 0) return;

    const provider = account?.provider ?? "credentials";

    for (const membership of memberships) {
      if (isNewUser) {
        await logAuditEvent({
          organizationId: membership.organization_id,
          actorId: dbUser.id,
          action: "user.signed_up",
          metadata: { provider, method: "oauth" },
        });
      }
      await logAuditEvent({
        organizationId: membership.organization_id,
        actorId: dbUser.id,
        action: "user.signed_in",
        metadata: { provider, is_new_user: !!isNewUser },
      });
    }
  } catch (error) {
    logError(error, "auditSignInEvent");
  }
}

export async function ensureAutoAcceptedDomainMembership(
  userId: string,
  email: string | null | undefined,
) {
  const domain = getEmailDomain(email);

  if (!domain) {
    debugAuth("Auto-accept domain skipped: missing domain", { userId, email });
    return;
  }

  if (isPersonalEmailDomain(domain)) {
    debugAuth("Auto-accept domain skipped: personal email domain", {
      userId,
      domain,
    });
    return;
  }

  try {
    const timer = new RequestTimer("ensureAutoAcceptedDomainMembership");

    const { data: enabledOrganizations, error: organizationsError } =
      await supabaseAdmin
        .from("organizations")
        .select("id")
        .eq("settings->autoAcceptDomainMembers->>enabled", "true")
        .eq("settings->autoAcceptDomainMembers->>domain", domain);

    timer.checkpoint("fetchOrganizations");

    if (organizationsError) {
      logError(
        organizationsError,
        "ensureAutoAcceptedDomainMembership.fetchOrganizations",
      );
      return;
    }

    if (!enabledOrganizations || enabledOrganizations.length === 0) {
      debugAuth("Auto-accept domain: no organizations matched domain", {
        userId,
        domain,
      });
      return;
    }

    const { data: existingMemberships, error: membershipsError } =
      await supabaseAdmin
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", userId);

    timer.checkpoint("fetchMemberships");

    if (membershipsError) {
      logError(
        membershipsError,
        "ensureAutoAcceptedDomainMembership.fetchMemberships",
      );
      return;
    }

    const existingOrgIds = new Set(
      (existingMemberships || []).map(
        (membership: { organization_id: string }) => membership.organization_id,
      ),
    );

    const organizationsToJoin = (enabledOrganizations || []).filter(
      (organization: { id: string | null }) =>
        organization?.id && !existingOrgIds.has(organization.id),
    );

    if (organizationsToJoin.length === 0) {
      debugAuth(
        "Auto-accept domain: user already belongs to all matched organizations",
        {
          userId,
          domain,
        },
      );
      return;
    }

    const insertPayload = organizationsToJoin.map((organization) => ({
      user_id: userId,
      organization_id: organization.id as string,
      role: "member",
      status: "active",
    }));

    const { error: insertError } = await supabaseAdmin
      .from("organization_members")
      .insert(insertPayload);

    timer.end({ step: "insertMemberships" });

    if (insertError) {
      if ((insertError as { code?: string }).code === "23505") {
        debugAuth("Auto-accept domain: membership already exists (duplicate)", {
          userId,
          domain,
        });
      } else {
        logError(
          insertError,
          "ensureAutoAcceptedDomainMembership.insertMemberships",
        );
      }
      return;
    }

    // Without this, auto-joining the org leaves any prior invitation row
    // orphaned — it shows up as a "phantom pending invite" on the team page
    // for someone who is already an active member.
    if (email) {
      const joinedOrgIds = organizationsToJoin
        .map((organization) => organization.id as string | null)
        .filter((id): id is string => Boolean(id));
      const escapedEmail = email.replace(/[%_\\]/g, (match) => `\\${match}`);
      const { error: deleteInvitesError } = await supabaseAdmin
        .from("invitations")
        .delete()
        .in("organization_id", joinedOrgIds)
        .ilike("email", escapedEmail);

      if (deleteInvitesError) {
        logError(
          deleteInvitesError,
          "ensureAutoAcceptedDomainMembership.deleteInvitations",
        );
      }
    }

    debugDatabase("Auto-accepted domain membership inserted", {
      userId,
      domain,
      organizationsCount: organizationsToJoin.length,
    });
  } catch (error) {
    logError(error, "ensureAutoAcceptedDomainMembership");
  }
}

export async function createUser(
  email: string,
  name: string,
  passwordHash: string,
  verificationToken: string,
  verificationExpires: Date,
  emailVerified = false,
) {
  const timer = new RequestTimer("createUser");

  try {
    debugAuth("Creating new user", {
      email,
      name,
      hasPassword: !!passwordHash,
      tokenLength: verificationToken.length,
      expiresAt: verificationExpires.toISOString(),
      emailVerified,
    });

    const { data: user, error } = await supabaseAdmin
      .from("users")
      .insert({
        email,
        name,
        password_hash: passwordHash,
        email_verified: emailVerified,
        // Clicking a valid invite link proves inbox ownership, so we skip
        // the separate verification step for invited users.
        email_verification_token: emailVerified ? null : verificationToken,
        email_verification_expires: emailVerified
          ? null
          : verificationExpires.toISOString(),
      })
      .select()
      .single();

    if (error) {
      debugDatabase("Database error creating user", { error });
      throw error;
    }

    debugAuth("User created successfully", {
      userId: user.id,
      email: user.email,
      emailVerified: user.email_verified,
    });

    timer.end({ userId: user.id });
    return user;
  } catch (error) {
    timer.end({ error: true });
    logError(error, "createUser");
    throw error;
  }
}

export async function verifyEmailToken(token: string) {
  try {
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("email_verification_token", token)
      .gt("email_verification_expires", new Date().toISOString())
      .single();

    if (error || !user) {
      return { success: false, message: "Invalid or expired token" };
    }

    // Update user as verified
    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        email_verified: true,
        email_verification_token: null,
        email_verification_expires: null,
      })
      .eq("id", user.id);

    if (updateError) {
      throw updateError;
    }

    return { success: true, user };
  } catch (error) {
    logError(error, "verifyEmailToken");
    return { success: false, message: "Verification failed" };
  }
}

export async function createPasswordResetToken(email: string) {
  try {
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !user) {
      return { success: false, message: "User not found" };
    }

    const resetToken = uuidv4();
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        password_reset_token: resetToken,
        password_reset_expires: resetExpires.toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      throw updateError;
    }

    return { success: true, token: resetToken, user };
  } catch (error) {
    logError(error, "createPasswordResetToken");
    return { success: false, message: "Failed to create reset token" };
  }
}

export async function resetPassword(token: string, newPassword: string) {
  try {
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("password_reset_token", token)
      .gt("password_reset_expires", new Date().toISOString())
      .single();

    if (error || !user) {
      return { success: false, message: "Invalid or expired token" };
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password and clear reset token
    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        password_hash: passwordHash,
        password_reset_token: null,
        password_reset_expires: null,
      })
      .eq("id", user.id);

    if (updateError) {
      throw updateError;
    }

    // Invalidate all existing sessions
    await supabaseAdmin.from("sessions").delete().eq("user_id", user.id);

    return { success: true };
  } catch (error) {
    logError(error, "resetPassword");
    return { success: false, message: "Password reset failed" };
  }
}

export interface CreateOrganizationOptions {
  githubOrgId?: number | null;
  githubOrgLogin?: string | null;
}

export async function createOrganization(
  userId: string,
  name: string,
  slug: string,
  options: CreateOrganizationOptions = {},
) {
  try {
    // Create organization
    const { data: organization, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({
        name,
        slug,
        plan: "free",
        settings: {
          autoAcceptDomainMembers: {
            enabled: false,
            domain: null,
          },
        },
        github_org_id: options.githubOrgId ?? null,
        github_org_login: options.githubOrgLogin ?? null,
      })
      .select()
      .single();

    if (orgError) {
      throw orgError;
    }

    // Add user as owner
    const { error: memberError } = await supabaseAdmin
      .from("organization_members")
      .insert({
        user_id: userId,
        organization_id: organization.id,
        role: "owner",
        status: "active",
      })
      .select()
      .single();

    if (memberError) {
      throw memberError;
    }

    return organization;
  } catch (error) {
    logError(error, "createOrganization");
    throw error;
  }
}
