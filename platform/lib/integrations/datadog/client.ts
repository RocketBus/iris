/**
 * Datadog API client for the integration's connect flow.
 *
 * Only the bits slice 2 needs land here: credential validation against
 * the DORA Metrics v2 read endpoints. Slice 3 will extend this module
 * with the actual sync calls (deployments / failures pagination).
 *
 * See docs/PLAN-datadog.md §9 for the request shape and probe findings.
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
