-- Epic #65 / issue #68: ingest AI-agent usage telemetry into an ALREADY
-- AGGREGATED table. There is deliberately no per-session, per-individual table
-- at rest — the smallest grain is (organization, repo, day, agent, model), per
-- the 2026-06-11 ADR. Identity never reaches this layer; the CLI strips it at
-- the edge (#67).
--
-- "tenant_id" in the issue maps to `organization_id` here, matching every other
-- iris table (repositories, metrics, api_tokens).

-- ---------------------------------------------------------------------------
-- usage_rollup — the only place agent usage lives at rest. Counts accumulate
-- via incremental upsert (see ingest_usage_rollup below).
-- ---------------------------------------------------------------------------
CREATE TABLE usage_rollup (
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  repository_id         UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  period_day            DATE NOT NULL,
  agent                 TEXT NOT NULL,
  model                 TEXT NOT NULL,

  sessions              BIGINT NOT NULL DEFAULT 0,
  input_tokens          BIGINT NOT NULL DEFAULT 0,
  output_tokens         BIGINT NOT NULL DEFAULT 0,
  cache_read_tokens     BIGINT NOT NULL DEFAULT 0,
  cache_creation_tokens BIGINT NOT NULL DEFAULT 0,
  tool_calls            BIGINT NOT NULL DEFAULT 0,
  sidechain_tool_calls  BIGINT NOT NULL DEFAULT 0,

  -- Coarse session-length histogram, e.g. {"15-60m": 3, "5-15m": 1}. The edge
  -- only ever sends a bucket label (the ADR forbids exact timestamps leaving
  -- the machine), so duration is stored as summable bucket counts rather than
  -- a `duration_sec` total.
  duration_buckets      JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (organization_id, repository_id, period_day, agent, model)
);

-- Dashboard read patterns (#69): "usage over time for an org / a repo".
CREATE INDEX idx_usage_rollup_org_period ON usage_rollup(organization_id, period_day DESC);
CREATE INDEX idx_usage_rollup_repo_period ON usage_rollup(repository_id, period_day DESC);

-- ---------------------------------------------------------------------------
-- usage_dedup — short-lived idempotency ledger. A flush may re-send the same
-- spooled record; the rotating dedup_key (an opaque hash of the session id,
-- #67) lets us drop replays. Keyed WITH (period, agent, model) because one
-- session emits one record per model/day, all sharing the same dedup_key.
--
-- The dedup_key NEVER enters usage_rollup. Rows are purged after a short window
-- (opportunistically inside ingest_usage_rollup) — long enough to absorb retries,
-- short enough that nothing accumulates here.
-- ---------------------------------------------------------------------------
CREATE TABLE usage_dedup (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  dedup_key       TEXT NOT NULL,
  period_day      DATE NOT NULL,
  agent           TEXT NOT NULL,
  model           TEXT NOT NULL,
  seen_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, dedup_key, period_day, agent, model)
);

CREATE INDEX idx_usage_dedup_seen ON usage_dedup(seen_at);

-- ---------------------------------------------------------------------------
-- ingest_usage_rollup — atomic dedup + incremental upsert.
--
-- The supabase-js builder can't express `col = col + EXCLUDED.col`, so the
-- additive upsert the issue requires lives here and is called via rpc().
-- Returns TRUE when the record was applied, FALSE when it was a known replay.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ingest_usage_rollup(
  p_org                   UUID,
  p_repo                  UUID,
  p_period                DATE,
  p_agent                 TEXT,
  p_model                 TEXT,
  p_dedup_key             TEXT,
  p_sessions              BIGINT,
  p_input_tokens          BIGINT,
  p_output_tokens         BIGINT,
  p_cache_read_tokens     BIGINT,
  p_cache_creation_tokens BIGINT,
  p_tool_calls            BIGINT,
  p_sidechain_tool_calls  BIGINT,
  p_duration_bucket       TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_claimed INTEGER;
BEGIN
  -- Opportunistic TTL purge — keeps the ledger from accumulating.
  DELETE FROM usage_dedup WHERE seen_at < now() - INTERVAL '7 days';

  -- Idempotency claim (only when a key is present). If the key was already
  -- seen for this (period, agent, model), it's a replay — skip the rollup.
  IF p_dedup_key IS NOT NULL AND p_dedup_key <> '' THEN
    INSERT INTO usage_dedup (organization_id, dedup_key, period_day, agent, model)
    VALUES (p_org, p_dedup_key, p_period, p_agent, p_model)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_claimed = ROW_COUNT;
    IF v_claimed = 0 THEN
      RETURN FALSE;  -- duplicate
    END IF;
  END IF;

  INSERT INTO usage_rollup AS ur (
    organization_id, repository_id, period_day, agent, model,
    sessions, input_tokens, output_tokens, cache_read_tokens,
    cache_creation_tokens, tool_calls, sidechain_tool_calls, duration_buckets
  ) VALUES (
    p_org, p_repo, p_period, p_agent, p_model,
    p_sessions, p_input_tokens, p_output_tokens, p_cache_read_tokens,
    p_cache_creation_tokens, p_tool_calls, p_sidechain_tool_calls,
    jsonb_build_object(p_duration_bucket, p_sessions)
  )
  ON CONFLICT (organization_id, repository_id, period_day, agent, model)
  DO UPDATE SET
    sessions              = ur.sessions + EXCLUDED.sessions,
    input_tokens          = ur.input_tokens + EXCLUDED.input_tokens,
    output_tokens         = ur.output_tokens + EXCLUDED.output_tokens,
    cache_read_tokens     = ur.cache_read_tokens + EXCLUDED.cache_read_tokens,
    cache_creation_tokens = ur.cache_creation_tokens + EXCLUDED.cache_creation_tokens,
    tool_calls            = ur.tool_calls + EXCLUDED.tool_calls,
    sidechain_tool_calls  = ur.sidechain_tool_calls + EXCLUDED.sidechain_tool_calls,
    duration_buckets      = ur.duration_buckets || jsonb_build_object(
      p_duration_bucket,
      COALESCE((ur.duration_buckets ->> p_duration_bucket)::BIGINT, 0) + p_sessions
    ),
    updated_at            = now();

  RETURN TRUE;  -- applied
END;
$$;
