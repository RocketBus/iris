-- 017_external_incidents.sql
-- Slice 3 of the Datadog integration (#15). Persists raw DORA failure
-- events pulled by the daily sync from POST /api/v2/dora/failures.
-- service / env / team are arrays because that's how DD returns them
-- (see docs/PLAN-datadog.md §9.2).

CREATE TABLE external_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider integration_provider NOT NULL,
  -- Datadog's event id. Idempotency key for upsert.
  provider_event_id TEXT NOT NULL,
  service TEXT[],
  env TEXT[],
  team TEXT[],
  -- DD's incident name, e.g. "RIO-978 | Pedidos sendo processados sem cobrança".
  name TEXT,
  -- Free-form ("Normal" | "High" | "Urgent" observed; not normalized).
  severity TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  time_to_restore_seconds INTEGER,
  -- "api" in all observed events (customer pushes from their RIO workflow).
  source TEXT,
  raw JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

CREATE INDEX idx_external_incidents_org_started
  ON external_incidents(organization_id, started_at DESC);
CREATE INDEX idx_external_incidents_service_gin
  ON external_incidents USING GIN (service);
