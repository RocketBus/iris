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

// ---------------------------------------------------------------------------
// Dashboard view (#69): repo-grain usage with k-anonymity suppression + the
// usage×durability cross-reference. Zero per-person fields — `contributors` is
// a COUNT used only to decide suppression, never names.
// ---------------------------------------------------------------------------

export interface AgentUsageRow {
  /** Repo name, or null on the suppressed "Others" aggregate. */
  repo: string | null;
  /** Distinct contributors on the repo (count only). 0 on the aggregate. */
  contributors: number;
  /** True on the folded "Others" row (repos below the k threshold). */
  suppressed: boolean;
  /** Number of repos folded in — only set on the suppressed row. */
  repoCount: number;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  toolCalls: number;
  /** Model with the most output tokens on this repo, or null. */
  topModel: string | null;
  /** Merged coarse session-length histogram. */
  durationBuckets: Record<string, number>;
  // Cross-reference with the engine (null on the suppressed aggregate).
  stabilization: number | null;
  durabilityAi: number | null;
}

export interface AgentUsageSection {
  /** Visible repo rows (contributors >= k), sorted by output tokens desc. */
  rows: AgentUsageRow[];
  /** Folded aggregate of repos below the k threshold, or null if none. */
  suppressedRow: AgentUsageRow | null;
  totals: {
    sessions: number;
    inputTokens: number;
    outputTokens: number;
    toolCalls: number;
  };
  /** k-anonymity threshold applied (repo contributor count). */
  kThreshold: number;
  /** How many repos were suppressed into the aggregate. */
  suppressedRepoCount: number;
}
