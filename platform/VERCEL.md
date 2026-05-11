# Deploying to Vercel

The platform is the only deployable artifact in the repo. The Python `iris/` package is shipped separately (via the `install.sh`/`install.ps1` scripts that pull wheels from GitHub Releases).

## One-time setup

1. **Import the project** at https://vercel.com/new
   - Repository: `RocketBus/clickbus-iris`
   - **Root Directory**: `platform`
   - Framework: Next.js (auto-detected)
   - Build/Install commands: defaults

2. **Add your custom domain**
   - Vercel → Project Settings → Domains → add the domain you'll deploy under (e.g. `iris.example.com`)
   - Configure the DNS provider with `CNAME → cname.vercel-dns.com`

3. **Configure GitHub OAuth** (production only)
   - https://github.com/settings/developers → New OAuth App
     - Homepage URL: your deployment URL (e.g. `https://iris.example.com`)
     - Authorization callback URL: `<deployment-URL>/api/auth/callback/github`
   - Copy `Client ID` + new `Client Secret` into Vercel env vars below

4. **Set environment variables** (Vercel → Project Settings → Environment Variables, scope **Production**):

   | Variable                                    | Required? | Notes                                                                              |
   | ------------------------------------------- | --------- | ---------------------------------------------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`                  | required  | Supabase project URL                                                               |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY`             | required  | Supabase anon key                                                                  |
   | `SUPABASE_SERVICE_ROLE_KEY`                 | required  | Supabase service-role key (never expose to client)                                 |
   | `NEXTAUTH_URL`                              | required  | your deployment URL                                                                |
   | `NEXTAUTH_SECRET`                           | required  | `openssl rand -base64 32`                                                          |
   | `JWT_SECRET`                                | required  | `openssl rand -base64 64`                                                          |
   | `GITHUB_CLIENT_ID`                          | required  | from GitHub OAuth app                                                              |
   | `GITHUB_CLIENT_SECRET`                      | required  | from GitHub OAuth app                                                              |
   | `RESEND_API_KEY`                            | required  | Resend API key (https://resend.com/api-keys)                                       |
   | `EMAIL_FROM`                                | required  | sender address on a domain verified in Resend                                      |
   | `SECURITY_CONTACT_EMAIL`                    | optional  | shown in SECURITY.md / CoC for vuln disclosure                                     |
   | `NEXT_PUBLIC_APP_URL`                       | required  | your deployment URL (drives canonical links, sitemap, install command shown in UI) |
   | `NEXT_PUBLIC_APP_NAME`                      | optional  | defaults to `Iris`                                                                 |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional  | enables Google OAuth                                                               |

5. **Apply Supabase migrations** (one-time, from local):
   ```bash
   cd platform
   npm run db:migrate
   ```

## Preview deployments

Preview URLs (per branch / commit) are not configured for OAuth. The "Sign in with GitHub" button on a preview deploy will fail because the callback URL won't match the OAuth app. This is intentional for an internal-only tool — preview deploys are for visual review, not auth flows.

If preview-OAuth is needed later, register a second GitHub OAuth App with a wildcard callback (`https://*.vercel.app/api/auth/callback/github`) and gate it behind a separate set of env vars.

## Region

`vercel.json` pins functions to `gru1` (São Paulo) — closest region to our users. Change there if you ever migrate.

## What's not on Vercel

- The Python `iris/` CLI is shipped as a wheel in GitHub Releases and installed via `install.sh`/`install.ps1` served from this app. It is not published to PyPI.
- Supabase Postgres is its own managed service.
- Resend handles transactional email (signup verification, invitations, 2FA codes).

## Troubleshooting

- **"Invalid environment variables"** at boot — the `lib/env.ts` schema rejected something. Check the build log for the missing/invalid var name.
- **OAuth `redirect_uri_mismatch`** — `NEXTAUTH_URL` and the GitHub OAuth callback URL must match the deployment domain exactly (including https + no trailing slash).
- **Function timeout** — default is 10s. `/api/ingest` is bumped to 60s; if other routes need more, add `export const maxDuration = 60` at the top of the route file.
