# Deploying to Vercel

The platform is the only deployable artifact in the repo. The Python `iris/` package is shipped separately (PyPI).

## One-time setup

1. **Import the project** at https://vercel.com/new
   - Repository: `RocketBus/clickbus-iris`
   - **Root Directory**: `platform`
   - Framework: Next.js (auto-detected)
   - Build/Install commands: defaults

2. **Add the custom domain** `iris.clickbus.com`
   - Vercel → Project Settings → Domains → add `iris.clickbus.com`
   - Configure the DNS provider with `CNAME iris → cname.vercel-dns.com`

3. **Configure GitHub OAuth** (production only)
   - https://github.com/settings/developers → New OAuth App
     - Homepage URL: `https://iris.clickbus.com`
     - Authorization callback URL: `https://iris.clickbus.com/api/auth/callback/github`
   - Copy `Client ID` + new `Client Secret` into Vercel env vars below

4. **Set environment variables** (Vercel → Project Settings → Environment Variables, scope **Production**):

   | Variable | Required? | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | required | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | required | Supabase anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | required | Supabase service-role key (never expose to client) |
   | `NEXTAUTH_URL` | required | `https://iris.clickbus.com` |
   | `NEXTAUTH_SECRET` | required | `openssl rand -base64 32` |
   | `JWT_SECRET` | required | `openssl rand -base64 64` |
   | `GITHUB_CLIENT_ID` | required | from GitHub OAuth app |
   | `GITHUB_CLIENT_SECRET` | required | from GitHub OAuth app |
   | `RESEND_API_KEY` | required | Resend API key (https://resend.com/api-keys) |
   | `EMAIL_FROM` | required | e.g. `noreply@notifications.clickbus.com.br` (must be a verified domain in Resend) |
   | `NEXT_PUBLIC_APP_URL` | required | `https://iris.clickbus.com` |
   | `NEXT_PUBLIC_APP_NAME` | optional | defaults to `Iris` |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | enables Google OAuth |

5. **Apply Supabase migrations** (one-time, from local):
   ```bash
   cd platform
   npm run db:migrate
   ```

## Preview deployments

Preview URLs (per branch / commit) are not configured for OAuth. The "Sign in with GitHub" button on a preview deploy will fail because the callback URL won't match the OAuth app. This is intentional for an internal-only tool — preview deploys are for visual review, not auth flows.

If preview-OAuth is needed later, register a second GitHub OAuth App with a wildcard callback (`https://*.vercel.app/api/auth/callback/github`) and gate it behind a separate set of env vars.

## Region

`vercel.json` pins functions to `gru1` (São Paulo) — closest region to Clickbus users. Change there if you ever migrate.

## What's not on Vercel

- The Python `iris/` CLI is published to PyPI separately (see root `README.md`).
- Supabase Postgres is its own managed service.
- Resend handles transactional email (signup verification, invitations, 2FA codes).

## Troubleshooting

- **"Invalid environment variables"** at boot — the `lib/env.ts` schema rejected something. Check the build log for the missing/invalid var name.
- **OAuth `redirect_uri_mismatch`** — `NEXTAUTH_URL` and the GitHub OAuth callback URL must match the deployment domain exactly (including https + no trailing slash).
- **Function timeout** — default is 10s. `/api/ingest` is bumped to 60s; if other routes need more, add `export const maxDuration = 60` at the top of the route file.
