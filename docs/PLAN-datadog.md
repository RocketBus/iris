# PLAN — Datadog integration (#15)

Working plan for [#15](https://github.com/RocketBus/clickbus-iris/issues/15).
Pre-implementation; **not a design doc** — resolves the open questions
from the issue, proposes a PR breakdown, and flags decisions that still
need user input. Once it lands and is approved, slices ship one PR at a
time.

This is also the implicit *opening* of Stage 3 ("Scale & Enterprise
Readiness") since cross-system correlation is explicitly listed there in
the project CLAUDE.md. We're not adopting any other Stage 3 abstractions
(RBAC matrix, SCIM, policy engine) here — only the integration capability.

---

## 1. Open questions from the issue — proposed answers

| # | Question | Proposed answer | Rationale |
|---|---|---|---|
| 1 | DORA Metrics API v2 vs generic Metrics API | **DORA Metrics API v2 only** (read endpoints) | The generic API returns pre-aggregated time-series buckets; the DORA API returns raw events with `commit_sha`, `repository_url`, `service`, `env`. We need event-level data to attribute deploys/incidents back to specific commits and PRs. Pre-aggregated buckets lose that. |
| 2 | Cron infrastructure: Vercel Cron vs Supabase Edge Functions vs worker | **Vercel Cron** + a Next.js API route handler | Same repo, same deploy pipeline; schedules declared in `vercel.json`. Daily Datadog pull fits well inside the 300 s function timeout (Fluid Compute default). No new operational surface. Supabase Edge Functions would require a separate deploy unit and Deno runtime. Standalone worker is overkill for v1. |
| 3 | Credential encryption strategy | **Postgres `pgcrypto`** with a server-side master key from `INTEGRATIONS_ENCRYPTION_KEY` env var; encrypt/decrypt at the API boundary | Defense-in-depth: even with service-role access, credentials in the table are useless without the env key. KMS-backed master key is a future option but adds infra; not v1. The key lives in Vercel env vars and is rotated by re-encrypting the column on demand. |
| 4 | RLS for `org_integrations` | **Service-role only, RLS as defense-in-depth** | All access is through Next.js API routes using `supabaseAdmin`. No client-side reads. We still declare a policy mirroring `organizations` (member-of-org), so a future client-direct path would inherit isolation. |
| 5 | Service → repo matching | **Auto-match by `repository_url`, allow manual override** | Datadog deploy events include `repository_url` when the customer has wired the Datadog GitHub integration. We match on that. When the URL is missing or doesn't resolve to a tracked Iris repo, store the event in a "unmatched" bucket and surface the count in the integration detail page — customer can add a manual `service → repo_id` mapping to bind them. |

The user-facing decisions that **need explicit input** before slice 2
ships are listed under §7 "Decisions still needed from the user" below.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Vercel Cron (daily @ 04:00 UTC)                         │
│        │                                                  │
│        ▼                                                  │
│  /api/cron/sync-integrations  (Next.js API route)        │
│        │                                                  │
│        ├─ for each org with active integration:           │
│        │     ├─ load credentials (decrypt with master key)│
│        │     ├─ fetch deployments since last_sync_at       │
│        │     ├─ fetch failures (incidents) since last_sync│
│        │     ├─ upsert into external_deployments           │
│        │     ├─ upsert into external_incidents             │
│        │     └─ update last_sync_at / last_error           │
└──────────────────────────────────────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │   Supabase      │
              │  org_integrations│
              │  external_deployments
              │  external_incidents
              └─────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│  Engine (CLI run) ─ optional consumer                     │
│    Aggregator reads external_deployments/incidents via    │
│    Supabase when an org has an active integration, and    │
│    populates `cfr_real`/`mttr_real` alongside the existing│
│    `cfr` / `mttr` (which become "_estimated" suffix).     │
└──────────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│  Platform UI                                              │
│   /[tenant]/settings/integrations                         │
│   /[tenant]/settings/integrations/datadog                 │
│   DORA cards on dashboard pick up a "Datadog" badge       │
│     when the value comes from external_*, "Estimated"     │
│     when it's the git-derived fallback.                   │
└──────────────────────────────────────────────────────────┘
```

The engine does **not** call Datadog directly. The platform owns the
sync, the engine reads the resulting tables. This keeps the CLI fast
(no API roundtrips during analysis) and lets the sync run on Vercel
without needing the user to install anything.

---

## 3. Schema (new migrations)

### `org_integrations`

```sql
create type integration_provider as enum ('datadog');
create type integration_status as enum ('active', 'error', 'disconnected');

create table org_integrations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider        integration_provider not null,
  status          integration_status not null default 'active',
  -- credentials_encrypted is pgp_sym_encrypt(json_credentials, $env_key)
  credentials_encrypted bytea not null,
  config          jsonb not null default '{}'::jsonb,
  last_sync_at    timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, provider)
);

create index org_integrations_status_idx on org_integrations(status)
  where status = 'active';
```

`config` payload for Datadog: `{ "site": "us1.datadoghq.com", "service_mappings": [ {"service": "x", "repository_id": "..."} ] }`.

### `external_deployments`

```sql
create table external_deployments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider        integration_provider not null,
  provider_event_id text not null,         -- Datadog's deployment_id
  repository_id   uuid references repositories(id) on delete set null,
  service         text,
  env             text,
  commit_sha      text,
  started_at      timestamptz not null,
  finished_at     timestamptz,
  status          text,
  raw             jsonb not null,          -- full Datadog payload
  fetched_at      timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index external_deployments_org_started_idx
  on external_deployments(organization_id, started_at desc);
create index external_deployments_repo_started_idx
  on external_deployments(repository_id, started_at desc)
  where repository_id is not null;
```

### `external_incidents`

```sql
create table external_incidents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider        integration_provider not null,
  provider_event_id text not null,         -- Datadog's incident/failure id
  repository_id   uuid references repositories(id) on delete set null,
  service         text,
  env             text,
  triggered_at    timestamptz not null,
  resolved_at     timestamptz,
  severity        text,
  triggering_commit_sha text,              -- when DD attributes a CFR event
  raw             jsonb not null,
  fetched_at      timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index external_incidents_org_triggered_idx
  on external_incidents(organization_id, triggered_at desc);
```

### Encryption helpers

`platform/lib/encryption.ts` exposes:

```ts
export function encryptCredentials(plain: object): string;
export function decryptCredentials(encrypted: string): object;
```

Both use `pgcrypto.pgp_sym_encrypt` / `pgp_sym_decrypt` through
`supabaseAdmin.rpc(...)` so the key never leaves the env. Avoid
node-side crypto so we don't need a separate KDF.

---

## 4. PR breakdown

Each PR is small enough to review in one sitting; later PRs depend on
earlier ones but the breaks are at testable boundaries.

| # | Slice | Files | Approx. LOC | Depends on |
|---|---|---|---|---|
| **1** | UI skeleton (page + nav, no DB) | platform pages + translations | ~120 | — |
| **2** | DB + encryption + connect flow | migration + API + UI form + Datadog client | ~450 | 1 |
| **3** | Ingestion + cron + tables | migrations + cron route + DORA fetcher + idempotency | ~600 | 2 |
| **4** | Engine consumes external data | aggregator + schema fields + Supabase queries | ~350 | 3 |
| **5** | Dashboard surfacing + correlation | DORA badges + new correlation card | ~250 | 4 |

Cumulative ~1.8k LOC, four to five focused PRs. The user can stop at
any boundary and still have a useful product (e.g., shipping through #2
gives "Connect Datadog" UX, useful for marketing/sales validation even
before #3 ingests data).

### PR 1 — UI skeleton

- Route `app/[tenant]/settings/integrations/page.tsx` lists available
  providers and their status. Datadog shows `Not connected`.
- Route `app/[tenant]/settings/integrations/[provider]/page.tsx`
  renders a per-provider stub.
- Add an "Integrations" entry to the settings nav (`platform/src/app/[tenant]/settings/...`).
- Translation keys under `settings.integrations.*` in `platform/lib/translations.ts` (en-US + pt-BR).
- No DB changes; status is hardcoded to `Not connected`.

### PR 2 — DB + encryption + connect flow

- Migration `013_org_integrations.sql` with the table from §3 plus the
  RLS policy mirroring `organizations`.
- `platform/lib/encryption.ts` for pgcrypto wrappers.
- `INTEGRATIONS_ENCRYPTION_KEY` documented in `env.example` and
  `VERCEL.md`. Generate with `openssl rand -base64 32`.
- `app/api/organizations/[organizationId]/integrations/[provider]/route.ts`
  with `GET` (status, masked credential prefix), `POST` (validate + save),
  `DELETE` (mark disconnected, keep historical data per AC).
- `platform/lib/integrations/datadog/client.ts` — typed wrapper around
  `POST /api/v2/dora/deployments` for the validation ping. Per-site
  base URL handling.
- Detail page form: API key, App key, Site dropdown. On submit calls
  the API, surfaces validation error verbatim from Datadog when the key
  lacks `dora_metrics_read`.
- Disconnect button on the detail page with the "data preserved"
  warning copy.

### PR 3 — Ingestion + cron + tables

- Migrations `014_external_deployments.sql`, `015_external_incidents.sql`.
- `vercel.json` `crons` entry: daily at `0 4 * * *` UTC (configurable
  later via env if a customer needs a different cadence).
- `app/api/cron/sync-integrations/route.ts` — auth-gated to
  `CRON_SECRET` header (Vercel pattern); loops active integrations,
  fans out per-provider sync. Per-org work runs sequentially within the
  route's 300 s budget (orgs with massive backfill get incremental sync
  over multiple cron runs).
- `platform/lib/integrations/datadog/sync.ts`:
  - Cursor by `last_sync_at`; first run defaults to 30 days back.
  - Paginate via the cursor parameter Datadog returns.
  - Upsert by `(provider, provider_event_id)` for idempotency.
  - Match `repository_url` → `repositories.remote_url`; leave
    `repository_id = null` when unmatched.
- Surface `last_sync_at` / `last_error` / `unmatched_count` on the
  detail page.

### PR 4 — Engine consumes external data

- Aggregator gets a new constructor input `external_data: ExternalData
  | None` containing pre-fetched deployments/incidents for the analysis
  window (fetched from Supabase before invoking the analyzer).
- New `iris/analysis/dora_real.py` computing CFR/MTTR from external
  events; existing `dora` logic becomes "estimated" path.
- `ReportMetrics` fields: `cfr_real`, `mttr_real`, `cfr_source`
  (`"datadog" | "estimated"`).
- The CLI passes external data only when running through the platform's
  trigger; standalone `iris .` runs continue computing the estimated
  variant.

### PR 5 — Dashboard

- DORA cards on `/[tenant]/dashboard` get a small badge:
  - `Datadog` (signal-green tint) when source is real.
  - `Estimated` (muted) when fallback.
- New correlation card on the home: **CFR by code origin**
  (AI_ASSISTED vs HUMAN), backed by `external_incidents` joined with
  `commit_origin` via `triggering_commit_sha`. Hidden unless ≥ 10
  incidents in the window.
- Documentation: `docs/integrations/datadog.md` covering customer
  setup, permissions, and what data the Iris will/won't see.

---

## 5. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `repository_url` missing on Datadog events → no auto-match | High | Surface "X events unmatched" on the detail page; let the customer add manual `service → repo` mappings stored in `config`. |
| Datadog rate limits during initial backfill (org with multi-year history) | Medium | Hard cap on initial sync window (30 days). Subsequent crons incrementally extend. |
| Encryption key rotation needed mid-life | Low | Document the column re-encrypt procedure in `docs/integrations/datadog.md`; build a one-shot script when first needed. |
| Customer connects integration but `dora_metrics_read` is missing | Medium | Connect endpoint validates with a live call and surfaces the Datadog error verbatim. |
| Cron run exceeds 300 s on big orgs | Low | Time-budget each org sync; resume from `last_sync_at` next run. |
| Sensitive credentials leaked to client | Low | API never returns the decrypted value; only the masked prefix (`dd-api-****…1234`). Form submission goes once, never round-trips. |

---

## 6. Out of scope (mirrors the issue's non-goals)

- Other providers (PagerDuty, Sentry, Linear, Jira).
- Push from Iris to Datadog.
- Webhook-based ingestion.
- Per-org sync cadence configuration.
- UI for browsing raw Datadog events.
- Multiple Datadog accounts per Iris org.

---

## 7. Decisions still needed from the user

These can't be guessed without business context. None of them block
PR 1 (skeleton), but PR 3 (ingestion) needs all of them resolved.

1. **Initial backfill window** for the first sync of a new connection.
   Proposed default: **30 days**. Alternatives: 90 days, 180 days.
   Tradeoff: longer windows = more API quota burnt at connection time.
2. **Cron schedule**. Proposed: **daily at 04:00 UTC** (01:00 BRT,
   off-peak for everyone). Alternative: hourly for orgs that want
   near-real-time DORA.
3. **A real Datadog API key for development.** Slice 2 can scaffold the
   form without one (the validation call will just fail in dev), but
   slice 3 needs real DORA events flowing to test idempotency,
   pagination, and matching. Need either a Datadog test account or a
   live customer key with read-only DORA scope to test against.
4. **What "active correlation" do we want first on the dashboard?** The
   issue suggests "CFR by code origin (AI_ASSISTED vs HUMAN)". Approve
   that, or pick another? E.g. "Lead time real vs estimated drift" or
   "MTTR by intent of the triggering commit".
5. **Stage 3 opening.** This PR plan implicitly opens Stage 3. Confirm
   that's the user's intent and that other Stage 3 work (RBAC, SCIM,
   anonymized benchmarking) stays explicitly out of scope until the
   Datadog integration is shipped end-to-end.

Once these are answered, PR 1 can ship.

---

## 8. Revision (2026-05-13) — list endpoint is POST-with-body, not GET

The original §1 picked **DORA Metrics API v2 (read endpoints)** as the
source for raw deployment and failure events. That was directionally
correct. An earlier draft of this section claimed the API was
write-only based on GET probes that returned 404 — that conclusion was
wrong. Datadog's list-with-filters endpoints accept POST with a JSON
body (the filter object doesn't fit cleanly as URL query params),
which is a known but non-REST-standard pattern. Re-probing with POST:

```
POST /api/v2/dora/deployments (no auth, valid body shape) → HTTP 401
POST /api/v2/dora/failures    (no auth, valid body shape) → HTTP 401
GET  /api/v2/dora/deployments/test-id (no auth)           → HTTP 401
```

401 (not 404) means the endpoints exist and reject only for missing
auth — confirming the original §1 plan. The 404s observed earlier were
Datadog returning "no GET handler at this path" instead of HTTP 405
Method Not Allowed.

Slice 1 (UI skeleton) was unaffected. The rest of the original plan
stands; only the HTTP verb and request shape change for the list calls.

### The four endpoints that matter

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v2/dora/deployments` | POST | List deployment events with filters (`from`, `to`, `query`, `limit`, `sort`). Body wraps the filters under `data.attributes`, `data.type = "dora_deployments_list_request"`. |
| `/api/v2/dora/failures` | POST | List failure/incident events with the same filter shape; `data.type = "dora_failures_list_request"`. |
| `/api/v2/dora/deployments/{id}` | GET | Single deployment detail (used to enrich a row on demand). |
| `/api/v2/dora/failures/{id}` | GET | Single failure detail. |

Each deployment event exposes — per Datadog's published reference —
`service`, `team`, `env`, `version`, `repository_id`, `change_failure`
(bool), `recovery_time`, `avg_change_lead_time`, commit count, and the
constituent lead-time stages (review, merge, time-to-deploy). That's
more than enough to populate `external_deployments` with commit-linked
detail and to compute per-origin CFR — the original correlation card
goal in §7 #4 is back on the table.

**One real caveat carried over** from the doc you shared: DORA event
retention on Datadog is **2 years**. Initial backfill window is fine
inside that envelope (the §7 default was 30 days); we shouldn't try to
go further back than 24 months on first sync.

### Impact on the rest of the plan

- **§1 row 1** ("DORA Metrics API v2 (read endpoints)") — the spirit
  stays, but the wording was off. Read = `POST .../deployments` and
  `POST .../failures` (list with body filters) plus `GET .../{id}`
  (single record). Treat those as the canonical read surface.
- **§3 schemas** — no change. `external_deployments` and
  `external_incidents` were modeled on the same fields the DORA event
  payload provides.
- **§4 PR breakdown** — no slice changes. Slice 3 stays one chunk.
- **§7 decision #4** — "CFR by code origin" is feasible after all;
  keep as the first correlation card.
- **§7 decision #6** introduced in the earlier (incorrect) draft of
  this §8 — drop it. There's no A/B/C choice; we go with the
  Option B / "raw events" path that was the original intent.

### Validation status

The two probe runs (GET → 404, POST → 401) confirm endpoints exist.
The dev keys provided in this session returned 403 on
`/api/v1/validate` so we don't yet have a happy-path response to
inspect — but the doc and the structural probes agree, and the user
provided a concrete `curl` example that matches the request shape
documented above. Before slice 3 starts (raw event ingestion), we need
working keys to:

- Run a real `POST /api/v2/dora/deployments` and confirm the response
  envelope shape matches what the schema in §3 expects.
- Confirm pagination cursor field name and behavior on real responses
  (the doc's `attributes.next_token` vs an envelope-level cursor — the
  exact spelling has changed between API versions before).
- Decide whether `query` should default to `*` or to `env:production`
  when the customer hasn't customized it.
