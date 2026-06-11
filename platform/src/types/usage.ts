/**
 * AI-agent usage telemetry types (epic #65, issue #68).
 *
 * `UsageRecord` is the anonymous wire shape the CLI edge (#67) sends to
 * POST /api/ingest/usage. `UsageRollupRow` is the aggregated row at rest.
 * Neither carries per-individual identity — the smallest grain is
 * (repo, day, model), per the 2026-06-11 ADR. See iris/models/agent_usage.py
 * for the producing side.
 */

export const USAGE_SCHEMA = "iris.agent_usage.v1";

/** One anonymous (repo, day, model) usage record from the CLI edge. */
export interface UsageRecord {
  schema?: string;
  agent: string;
  /** owner/repo or bare name; normalized to the bare repo name on ingest. */
  repo: string;
  /** UTC calendar day, YYYY-MM-DD. */
  period: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  tool_calls: number;
  sidechain_tool_calls: number;
  sessions: number;
  /** Coarse session-length label, e.g. "15-60m". */
  duration_bucket: string;
  /** Opaque hash of the session id (not identity); idempotency only. */
  idempotency_key: string;
}

/** Request body for POST /api/ingest/usage — a batch of spooled records. */
export interface UsageIngestBody {
  records: UsageRecord[];
}

/** Response from POST /api/ingest/usage. */
export interface UsageIngestResponse {
  applied: number;
  duplicates: number;
  repositories: number;
}

/** A row of `usage_rollup` as stored at rest (read by #69). */
export interface UsageRollupRow {
  organization_id: string;
  repository_id: string;
  period_day: string;
  agent: string;
  model: string;
  sessions: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  tool_calls: number;
  sidechain_tool_calls: number;
  /** Summable session-length histogram, e.g. {"15-60m": 3, "5-15m": 1}. */
  duration_buckets: Record<string, number>;
  created_at: string;
  updated_at: string;
}
