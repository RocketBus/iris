import type { PrReadStep } from "@/types/metrics";

// Every step the type allows. Keyed by the union, so the compiler checks both
// directions: a step added to `PrReadStep` fails to compile until it is here.
const KNOWN_STEPS: Record<PrReadStep, true> = {
  basic: true,
  enrichment: true,
  reviews: true,
  fetch: true,
};

/**
 * The degraded PR-read steps a metrics payload reports, or `[]` when none.
 *
 * `/api/ingest` stores the payload with `.passthrough()`, so this field can
 * arrive from any CLI version in any shape. Anything that is not a list of
 * known step names is ignored rather than trusted.
 */
export function prDegradedSteps(value: unknown): PrReadStep[] {
  if (!Array.isArray(value)) return [];
  const steps = value.filter(
    (step): step is PrReadStep =>
      typeof step === "string" && Object.hasOwn(KNOWN_STEPS, step),
  );
  // Same step twice adds nothing; keep the first occurrence's position.
  return [...new Set(steps)];
}

/** The `t()` of both `useTranslation` and `getServerTranslation`. */
export type Translate = (
  path: string,
  params?: Record<string, string | number>,
) => string;

/** Degraded steps as a localized, comma-separated list for tooltips/notes. */
export function formatPrSteps(
  steps: readonly PrReadStep[],
  t: Translate,
): string {
  return steps.map((step) => t(`repos.detail.prData.steps.${step}`)).join(", ");
}

/** Most repo names the dashboard note lists before collapsing the rest. */
export const MAX_LISTED_REPOS = 5;

/**
 * Repo names for the dashboard note: the first `max`, then a localized
 * "and N more" for the remainder, so one bad batch cannot flood the page.
 */
export function formatRepoNames(
  names: readonly string[],
  t: Translate,
  max: number = MAX_LISTED_REPOS,
): string {
  const listed = names.slice(0, max).join(", ");
  const rest = names.length - max;
  if (rest <= 0) return listed;
  return `${listed} ${t("dashboard.prDataMoreRepos", { count: rest })}`;
}

export interface DegradedRepo {
  id: string;
  name: string;
  steps: PrReadStep[];
}

/**
 * The repos whose latest payload reports a degraded PR read, in the order of
 * `repos`. Takes the payloads the dashboard already loads, so it costs no
 * extra query.
 */
export function degradedReposFromPayloads(
  repos: ReadonlyArray<{ id: string; name: string }>,
  payloads: ReadonlyMap<string, { pr_enrichment_degraded?: unknown }>,
): DegradedRepo[] {
  const degraded: DegradedRepo[] = [];
  for (const repo of repos) {
    const steps = prDegradedSteps(
      payloads.get(repo.id)?.pr_enrichment_degraded,
    );
    if (steps.length > 0)
      degraded.push({ id: repo.id, name: repo.name, steps });
  }
  return degraded;
}
