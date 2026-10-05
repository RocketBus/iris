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
  return value.filter(
    (step): step is PrReadStep =>
      typeof step === "string" && Object.hasOwn(KNOWN_STEPS, step),
  );
}
