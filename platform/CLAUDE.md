# Iris Platform

Multi-tenant Next.js application: public marketing site + authenticated engineering intelligence dashboard. Deployed to Vercel at the URL configured in `NEXT_PUBLIC_APP_URL`. The Python CLI in the parent repo ingests metrics here via `POST /api/ingest`.

## Stack

- Next.js 16.2.4 (App Router, Turbopack, `proxy.ts` convention)
- React 19, TypeScript 5
- NextAuth.js v4 (JWT strategy) with GitHub OAuth (primary), Google OAuth (optional), and email/password credentials
- Supabase Postgres + service-role client (no Supabase Auth, no RLS bypass needed for app code)
- Resend for transactional email
- TailwindCSS 4 + shadcn/ui (Radix primitives)
- Recharts (charts), Motion (animations)
- vitest for tests; husky + lint-staged for pre-commit hooks

## Architecture

### Public pages (unauthenticated)

- `/` — Landing page (Hero, Problem, ProvenData, HowItWorks, Modules, Positioning, CTA)
- `/faq` — FAQ (translated en/pt-br/es)
- `/sample` — Sample report
- `/deck` — Pitch deck
- `/privacy` — LGPD-compliant privacy policy (`platform/src/app/privacy/privacy.mdx`)
- `/terms` — Terms of Service (`platform/src/app/terms/terms.mdx`)
- `/welcome` — First-run guide (post-login)
- `/auth/signin`, `/auth/signup`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-2fa`, `/auth/verify-email`, `/auth/post-login`, `/auth/select-github-org`
- `/cli/authorize` — OAuth-style authorization for the CLI (`iris login`)

### Authenticated area (per-tenant)

- `/[tenant]/dashboard` — Org dashboard (health, AI vs human, intent distribution, KPI cards)
- `/[tenant]/repos` — Repository list
- `/[tenant]/repos/[repoName]` — Repo detail with charts
- `/[tenant]/compare` — Cross-repo comparison
- `/[tenant]/ai-exposure` — AI shadow detection
- `/[tenant]/audit-log` — Org audit log (feature flag `auditLog`, enabled by default)
- `/[tenant]/team` — Team management
- `/[tenant]/settings` — Organization settings
- `/[tenant]/profile` — User profile
- `/[tenant]/connect` — Connect a repo via the CLI
- `/me/ai-usage` — Personal AI usage (self-only)

### API routes

- `/api/ingest` — CLI metrics ingestion (token auth via `iris_*` prefix); `maxDuration = 60`
- `/api/tokens` — API token CRUD (NextAuth session)
- `/api/health` — Health check
- `/api/auth/*` — NextAuth + custom (signup, verify-email, forgot-password, etc.)
- `/api/auth/available-providers` — UI uses this to show only configured OAuth buttons
- `/api/auth/get-user-orgs`, `/api/auth/github-orgs` — GitHub org linkage during onboarding
- `/api/cli/authorize` — CLI authorization callback
- `/api/organizations/*` — Org management (create, update, logo, settings)
- `/api/microservices/{token,refresh,revoke}` — JWT for downstream services
- `/api/tenants/[tenant]/audit-logs`, `repo-count` — Tenant-scoped queries
- `/api/users/avatar` — Avatar upload

## Key patterns

- **Routing**: file-based App Router. `proxy.ts` (Next 16's renamed middleware, located at `platform/src/proxy.ts` because of the `src/` directory layout) handles tenant rewrite + sets the `iris_lang` cookie based on `Accept-Language` on first visit
- **Auth**: `getServerSession(authOptions)` for server components and API routes; client components consume `useSession()` from `next-auth/react`
- **DB**: `supabaseAdmin` from `@/lib/supabase` (service-role, bypasses RLS — only used server-side)
- **Email**: `@/lib/email` wraps Resend SDK. Domain in `EMAIL_FROM` must be verified in Resend
- **Feature flags**: `config/features.config.ts` — only 4 flags now: `auth`, `multiTenant`, `userManagement`, `auditLog` (all `enabled: true`)
- **Theme**: light mode by default with optional dark via `ThemeProvider` (no `forcedTheme`)
- **Translations**:
  - `useBrowserTranslation()` from `@/hooks/useBrowserTranslation` for public pages — reads from `LanguageProvider` context (server-resolved with cookie + `Accept-Language`, falls back to `pt-BR`)
  - `useTranslation()` from `@/hooks/useTranslation` for authenticated pages — reads from session preference, falls back to `pt-BR`
  - `getServerTranslation()` from `@/lib/server-translation` for server components
  - All three fall back to `en-US` keys when the chosen language is missing a key
  - Supported languages: en-US, pt-BR (full coverage), es-ES (partial — falls back to en-US)
- **Languages cookie**: `iris_lang` (1-year TTL). Toggled via `<LanguageToggle>` in the navbar
- **Rate limit**: removed (was an in-memory map; doesn't survive serverless invocations on Vercel)

## Local dev

```bash
cd platform
npm install --legacy-peer-deps   # also installs husky pre-commit hook
cp env.example .env.local        # fill in Supabase, NextAuth, GitHub OAuth, Resend keys
npx supabase start               # optional: local Postgres mirror
npm run dev                      # Turbopack, http://localhost:3000
```

Common scripts:

```bash
npm run lint                  # eslint --fix
npm run test                  # vitest
npm run test:coverage         # vitest with coverage report (lcov + html)
npx tsc --noEmit              # type check
npm run build                 # production build
npm run format                # prettier write
```

## Database

Supabase with 12 migrations under `platform/supabase/migrations/`:

- `001_initial_schema` — orgs, users, members, invitations
- `002_auth_enhancements`, `003_user_preferences`, `004_add_logo_url`, `005_refresh_tokens`, `006_auto_accept_domain_setting`, `007_audit_logs` — auth + scaffolding
- `008_iris_tables` — repositories, analysis_runs, metrics, api_tokens
- `009_github_user`, `010_active_users` — analysis_runs columns
- `011_github_org_link`, `012_github_org_members` — link Iris orgs to GitHub orgs

RLS policies in `supabase/policies/rls_policies.sql`.

## Deployment

Vercel at the URL configured in `NEXT_PUBLIC_APP_URL`. Configuration in `platform/vercel.json`:

- Region: `gru1` (São Paulo)
- Project root: `platform/`
- Build command: defaults

Environment variables and OAuth setup steps in `platform/VERCEL.md`.

## Code style

- **Comments**: only when _why_ is non-obvious. Don't restate what the code does.
- **Tests**: integration tests use real DBs; unit tests for analysis modules.
- **Types**: TS strict mode. Schemas via `zod` (in `lib/form-schema.ts` and `lib/env.ts`).
- **Pre-commit**: `lint-staged` runs `eslint --fix` + `prettier --write` on staged files; configured in `package.json`.

See the root `CLAUDE.md` for project-wide principles and the canonical metric chain.
