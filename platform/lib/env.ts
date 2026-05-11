import { z } from "zod";

/**
 * Environment variable validation (Factor 4: Configuration).
 *
 * Validates all env vars on first import with fail-fast behavior.
 * Import `env` instead of using `process.env` directly.
 */

const envSchema = z.object({
  // --- Supabase (required) ---
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // --- Auth (required) ---
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(1),

  // --- Google OAuth (optional) ---
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // --- GitHub OAuth (optional) ---
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // --- JWT (optional, fallbacks in code) ---
  JWT_SECRET: z.string().optional(),
  JWT_ISSUER: z.string().default("iris"),
  JWT_AUDIENCE: z.string().default("microservices"),

  // --- Email (Resend) ---
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("noreply@example.com"),
  SECURITY_CONTACT_EMAIL: z.string().default("security@example.com"),

  // --- Deployment operator (legal entity behind THIS deployment) ---
  // Drives the Privacy Policy and Terms of Service. The operator IS the LGPD/GDPR
  // data Controller and the counterparty to the Terms. Forks/self-hosters set
  // these to identify their own legal entity. Empty defaults render placeholders.
  // NEXT_PUBLIC_ because they are rendered into public Privacy / Terms pages and
  // read by client components that hydrate the MDX.
  NEXT_PUBLIC_OPERATOR_NAME: z.string().default(""),
  NEXT_PUBLIC_OPERATOR_JURISDICTION: z.string().default(""),
  NEXT_PUBLIC_OPERATOR_PRIVACY_EMAIL: z.string().default(""),
  NEXT_PUBLIC_OPERATOR_DPO_EMAIL: z.string().default(""),

  // --- App ---
  NEXT_PUBLIC_APP_NAME: z.string().default("Iris"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_DEFAULT_LOGO_URL: z.string().default("/logo.svg"),

  // --- Debug ---
  DEBUG_LEVEL: z.enum(["ERROR", "WARN", "INFO", "DEBUG", "TRACE"]).optional(),

  // --- System ---
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map(
      (issue) => `  ${issue.path.join(".")}: ${issue.message}`,
    );
    console.error(
      `\n❌ Invalid environment variables:\n${errors.join("\n")}\n`,
    );
    // Don't crash during build or on the client side
    // (Next.js evaluates modules at build time; client-side doesn't have server env vars)
    const isBuild = process.env.npm_lifecycle_event === "build";
    const isClient = typeof window !== "undefined";
    if (isBuild || isClient) {
      return envSchema.parse({
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL:
          process.env.NEXT_PUBLIC_SUPABASE_URL ||
          "https://placeholder.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY:
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder",
        SUPABASE_SERVICE_ROLE_KEY:
          process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder",
        NEXTAUTH_URL: process.env.NEXTAUTH_URL || "http://localhost:3000",
        NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "placeholder",
        EMAIL_FROM: process.env.EMAIL_FROM || "noreply@example.com",
      });
    }
    throw new Error("Environment validation failed. See errors above.");
  }

  return result.data;
}

export const env = validateEnv();
