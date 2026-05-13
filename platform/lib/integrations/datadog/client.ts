/**
 * Datadog API client for the DORA Metrics v2 read endpoints.
 *
 * Covers credential validation (slice 2) and the list-with-filters
 * fetchers used by the daily sync (slice 3). Pagination semantics are
 * documented in docs/PLAN-datadog.md §9.5 — there is no cursor mechanism
 * on these endpoints, the only way forward is to shrink the `to` window.
 */

export type DatadogSite =
  | "datadoghq.com"
  | "us3.datadoghq.com"
  | "us5.datadoghq.com"
  | "datadoghq.eu"
  | "ap1.datadoghq.com"
  | "ddog-gov.com";

export const SUPPORTED_SITES: DatadogSite[] = [
  "datadoghq.com",
  "us3.datadoghq.com",
  "us5.datadoghq.com",
  "datadoghq.eu",
  "ap1.datadoghq.com",
  "ddog-gov.com",
];

// Datadog's UI labels regions as US1/US3/EU/etc., but US1 and EU don't
// carry a region prefix in the API hostname. Accept the UI value and
// normalize to the actual site identifier.
const SITE_ALIASES: Record<string, DatadogSite> = {
  "us1.datadoghq.com": "datadoghq.com",
  "eu1.datadoghq.eu": "datadoghq.eu",
  "eu.datadoghq.com": "datadoghq.eu",
};

export function normalizeSite(raw: string): DatadogSite {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed in SITE_ALIASES) return SITE_ALIASES[trimmed];
  if (SUPPORTED_SITES.includes(trimmed as DatadogSite)) {
    return trimmed as DatadogSite;
  }
  throw new Error(`Unsupported Datadog site: ${raw}`);
}

export interface DatadogCredentials {
  apiKey: string;
  appKey: string;
  site: DatadogSite;
}

export interface ValidationResult {
  ok: boolean;
  /** HTTP status from Datadog; 0 if the request never left the function. */
  status: number;
  /** When ok=false, the human-readable detail from Datadog's `errors[]`. */
  errorDetail?: string;
}

/**
 * Ping Datadog with a cheap DORA deployments list (1-hour window, limit 1)
 * to confirm the credentials authenticate and carry `dora_metrics_read`.
 *
 * Returns ok=true on HTTP 200; otherwise surfaces Datadog's error detail
 * verbatim so the UI can show it without translation.
 */
export async function validateCredentials(
  creds: DatadogCredentials,
): Promise<ValidationResult> {
  const now = new Date();
  const to = stripMillis(now);
  const from = stripMillis(new Date(now.getTime() - 60 * 60 * 1000));

  const url = `https://api.${creds.site}/api/v2/dora/deployments`;
  const body = {
    data: {
      type: "dora_deployments_list_request",
      attributes: {
        from,
        to,
        query: "*",
        limit: 1,
      },
    },
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "DD-API-KEY": creds.apiKey,
        "DD-APPLICATION-KEY": creds.appKey,
      },
      body: JSON.stringify(body),
      // Connect flow runs server-side; cancel if Datadog is slow.
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      errorDetail:
        err instanceof Error ? err.message : "Network error contacting Datadog",
    };
  }

  if (response.ok) {
    return { ok: true, status: response.status };
  }

  let errorDetail: string | undefined;
  try {
    const payload = (await response.json()) as {
      errors?: Array<{ detail?: string; title?: string }>;
    };
    const first = payload.errors?.[0];
    errorDetail = first?.detail ?? first?.title;
  } catch {
    errorDetail = undefined;
  }

  return {
    ok: false,
    status: response.status,
    errorDetail: errorDetail ?? `Datadog returned HTTP ${response.status}`,
  };
}

function stripMillis(d: Date): string {
  // ISO 8601 with seconds precision and a literal Z. Datadog rejects numeric
  // epoch on these endpoints; it also rejects offsets like +00:00 in some
  // sites. The Z form is the safest documented shape.
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function toDatadogTimestamp(d: Date): string {
  return stripMillis(d);
}

export interface DoraListFilters {
  /** ISO 8601 (seconds precision, trailing Z). */
  from: string;
  /** ISO 8601 (seconds precision, trailing Z). */
  to: string;
  /** Datadog query language. Use "*" for unfiltered. */
  query: string;
  /**
   * Page size. Probed ceiling is at least 500; we cap at 100 for v1 to
   * keep response latency predictable. The §9.5 pagination loop relies
   * on `len(events) < limit` as the terminal condition.
   */
  limit: number;
}

export interface DoraDeploymentCommit {
  sha: string;
  timestamp?: string;
  author?: {
    email?: string;
    canonical_email?: string;
    is_bot?: boolean;
  };
  message?: string;
  html_url?: string;
  change_lead_time?: number;
  time_to_deploy?: number;
}

export interface DoraDeployment {
  type: "dora_deployment";
  id: string;
  attributes: {
    git?: { commit_sha?: string; repository_id?: string };
    commits?: DoraDeploymentCommit[];
    pull_requests?: Array<{
      created_at?: string;
      merged_at?: string;
      is_fully_automated?: boolean;
    }>;
    service?: string;
    env?: string;
    team?: string;
    version?: string;
    /** TRI-STATE: true | false | null (null = pending evaluation). */
    change_failure?: boolean | null;
    deployment_type?: string;
    source?: string;
    started_at: string;
    finished_at?: string;
    duration?: number;
    created_at?: string;
    number_of_commits?: number;
    number_of_pull_requests?: number;
    /** Present only when change_failure === true. */
    recovery_time_sec?: number;
    remediation?: { id?: string; type?: string };
  };
}

export interface DoraFailure {
  type: "dora_failure";
  id: string;
  attributes: {
    service?: string[];
    env?: string[];
    team?: string[];
    name?: string;
    /** "Normal" | "High" | "Urgent" observed; free-form. */
    severity?: string;
    started_at: string;
    finished_at?: string;
    created_at?: string;
    /** Seconds. */
    time_to_restore?: number;
    source?: string;
  };
}

export class DatadogApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "DatadogApiError";
  }
}

async function postDoraList<T>(
  creds: DatadogCredentials,
  endpoint: "deployments" | "failures",
  requestType: "dora_deployments_list_request" | "dora_failures_list_request",
  filters: DoraListFilters,
): Promise<T[]> {
  const url = `https://api.${creds.site}/api/v2/dora/${endpoint}`;
  const body = {
    data: {
      type: requestType,
      attributes: {
        from: filters.from,
        to: filters.to,
        query: filters.query,
        limit: filters.limit,
      },
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "DD-API-KEY": creds.apiKey,
      "DD-APPLICATION-KEY": creds.appKey,
    },
    body: JSON.stringify(body),
    // Each page fetch must complete inside the per-org sync budget.
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const payload = (await response.json()) as {
        errors?: Array<{ detail?: string; title?: string }>;
      };
      const first = payload.errors?.[0];
      detail = first?.detail ?? first?.title;
    } catch {
      detail = undefined;
    }
    throw new DatadogApiError(
      `Datadog ${endpoint} list failed with HTTP ${response.status}`,
      response.status,
      detail,
    );
  }

  const payload = (await response.json()) as { data?: T[] };
  return payload.data ?? [];
}

export function listDeployments(
  creds: DatadogCredentials,
  filters: DoraListFilters,
): Promise<DoraDeployment[]> {
  return postDoraList<DoraDeployment>(
    creds,
    "deployments",
    "dora_deployments_list_request",
    filters,
  );
}

export function listFailures(
  creds: DatadogCredentials,
  filters: DoraListFilters,
): Promise<DoraFailure[]> {
  return postDoraList<DoraFailure>(
    creds,
    "failures",
    "dora_failures_list_request",
    filters,
  );
}
