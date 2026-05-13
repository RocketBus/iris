# Datadog Integration

Iris pulls DORA events (deployments and failures) from a customer's
Datadog tenant and joins them to the engine's per-commit origin
classification. The result powers the dashboard's DORA section and the
AI-vs-human CFR correlation card.

This page covers what we need from the customer, what we read, and what
we don't.

---

## Setup

### 1. Create a Datadog Application Key

The integration uses two Datadog credentials:

- **API Key** — already issued at the org level. Used only as a tenant
  identifier on the DORA endpoints.
- **Application Key** — carries the user's permissions. Must include the
  `dora_metrics_read` scope. Create at *Datadog → Personal Settings →
  Application Keys → New Key*.

Both keys are passed once through the connect form and stored encrypted
at rest with `pgp_sym_encrypt` keyed by the deployment's
`INTEGRATIONS_ENCRYPTION_KEY` env var.

### 2. Pick the right site

Datadog has multiple regional sites. The connect form lists every site
we currently support:

- `datadoghq.com` (US1)
- `us3.datadoghq.com`
- `us5.datadoghq.com`
- `datadoghq.eu`
- `ap1.datadoghq.com`
- `ddog-gov.com`

Both US1 (`datadoghq.com`) and EU (`datadoghq.eu`) accept the unprefixed
hostname; the connect form's `normalizeSite` helper accepts the prefixed
aliases (`us1.…`, `eu1.…`, `eu.…`) too.

### 3. Connect from Iris

Iris → Settings → Integrations → Datadog → fill API Key, Application
Key, Site → **Connect**. Iris immediately validates the credentials by
hitting `POST /api/v2/dora/deployments` with a 1-hour, limit-1 query.
A 200 response stores the encrypted credentials; anything else surfaces
the Datadog error verbatim so the customer can fix it.

### 4. Cron picks it up

After the first connect, the daily Vercel Cron job
(`/api/cron/sync-integrations` @ `0 4 * * *` UTC) pulls events into
Supabase. The first run backfills 30 days; subsequent runs cursor from
`last_sync_at`. Pagination uses time-slicing — DORA v2 has no cursor
mechanism, see `docs/PLAN-datadog.md` §9.5 for the algorithm.

A manual trigger is supported in dev:

```bash
curl -H "x-cron-secret: $CRON_SECRET" \
  https://<your-host>/api/cron/sync-integrations
```

---

## What we read

Two endpoints, both `POST`:

| Endpoint | Purpose |
|---|---|
| `POST /api/v2/dora/deployments` | List deployment events with filters |
| `POST /api/v2/dora/failures` | List failure (incident) events with filters |

The cron job pulls every event whose `started_at` falls inside the
incremental window and upserts into `external_deployments` (+
`external_deployment_commits`) and `external_incidents`. Idempotent by
`(provider, provider_event_id)`.

**Per-deployment fields persisted:** `service`, `env`, `team`, `version`,
`commit_sha`, `change_failure` (TRI-STATE — `true|false|null`),
`deployment_type`, `source`, `started_at`, `finished_at`,
`duration_seconds`, `number_of_commits`, `number_of_pull_requests`,
`recovery_time_sec`, `remediation.type` (e.g. `rollback`), the raw
DD payload (JSONB), and the linked commits with their
`change_lead_time` / `time_to_deploy`.

**Per-incident fields persisted:** `service[]`, `env[]`, `team[]`,
`name`, `severity`, `started_at`, `finished_at`,
`time_to_restore_seconds`, `source`, raw payload.

---

## What we do NOT read or write

- **No write calls.** Iris never POSTs deployments or failures to
  Datadog. The integration is read-only.
- **No metrics-API queries.** We don't read APM dashboards, log
  pipelines, RUM data, or any non-DORA endpoint.
- **No customer secrets beyond the keys you provide.** The credentials
  stay encrypted in Supabase; the dashboard only ever shows a masked
  prefix (e.g. `dd-a…1234`).
- **No customer PII.** DORA events carry service / env / team metadata,
  commit SHAs, author emails (for the lead-time aggregation), and free-form
  failure names. Author emails come from Datadog's own classification of the
  Git data their APM Deployment Tracking already sees; Iris doesn't enrich
  them or push them anywhere external.

---

## How the data shows up in Iris

| Surface | Data |
|---|---|
| Dashboard "DORA" section | Org-wide CFR, MTTR (per failed deploy), deploy frequency, lead time, rollback rate, pending-evaluation count. Each card shows a "Datadog" badge so it's clear the number is real, not estimated. |
| Dashboard "Change Failure Rate by Code Origin" card | AI-vs-human CFR comparison from the per-commit join. Hidden until the org has ≥ 10 failed deploys in the window. |
| Per-repo report (`report.md`) | Descriptive bullets in *Key Findings*: CFR, MTTR, rollback rate. Numbers are also in the JSON payload as `dora_*` fields. |
| Integration detail page | `last_sync_at`, `last_error`, unmatched-deployments count (DD slugs that didn't resolve to a tracked Iris repo), and "last incident registered X days ago" — the latter is the §9.8 silent-decay guard. |

---

## Repository matching

Each Datadog deployment carries `attributes.git.repository_id`, a slug
like `github.com/<org>/<repo>`. Iris matches it against
`repositories.remote_url` by normalizing both sides (lowercase, drop
scheme / `.git` / `www` / trailing slash, convert `git@host:org/repo` →
`host/org/repo`). When the match fails, the deployment is persisted with
`repository_id = null` and counted under "unmatched deployments" on the
integration detail page so the customer can fix their Iris repo's remote
URL.

---

## Disconnecting

The disconnect button in the integration detail page:

1. Marks the row as `disconnected` in `org_integrations` (status flip).
2. Wipes `credentials_encrypted` so the daily sync skips this org.
3. **Preserves** the historical `external_deployments` /
   `external_incidents` rows. Re-connecting later resumes from the same
   table; the dashboard keeps showing whatever was already ingested.

To purge history entirely, contact your Iris admin to delete the
`org_integrations` row (cascades by FK).

---

## Operational notes

- **Initial backfill window:** 30 days. Datadog retains DORA events for
  2 years, but pulling the full 2-year window on a first run burns a lot
  of API quota for unclear value — most customers don't have meaningful
  cross-year comparisons at this stage of adoption.
- **Cron schedule:** daily at `0 4 * * *` UTC (01:00 BRT). Configurable
  per-deployment via `vercel.json`. Sub-daily cadence isn't supported
  yet — most DORA stories tolerate ≤ 24h staleness.
- **Rate limits:** Datadog's DORA endpoints have generous per-tenant
  limits. The cron caps page size at 100; on big tenants with multi-week
  backfills, expect 2–10 list calls per endpoint per run.
- **Encryption key rotation:** changing `INTEGRATIONS_ENCRYPTION_KEY`
  invalidates every stored credential. There's no automated re-encrypt
  script yet — when first needed, build one that decrypts with the old
  key and re-encrypts with the new in a single transaction. Slice 3+
  schema makes this trivial.

---

## See also

- `docs/PLAN-datadog.md` — full design doc, including the probe findings
  that shaped the schema (§9 onwards).
- `docs/METRICS.md` — canonical reference for every `dora_*` field on
  `ReportMetrics`.
