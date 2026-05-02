/**
 * Sample Iris report — frozen dataset for the /sample marketing page.
 *
 * Mirrors examples/sample-report.md so the page stays in sync with the
 * artifact people used to download. When the example is regenerated,
 * update the numbers here rather than parsing the markdown at build time.
 */

export type IntentRow = {
  intent: "FEATURE" | "FIX" | "REFACTOR" | "CONFIG" | "UNKNOWN";
  commits: number;
  linesChanged: number;
  stabilization: number; // 0.0–1.0
  churnEvents: number;
};

export type WeekRow = {
  weekStart: string; // MM-DD
  commits: number;
  loc: number;
  featurePct: number; // 0.0–1.0
  fixPct: number;
  stabilization: number | null; // 0.0–1.0, null when insufficient data
  churn: number;
  commitsPerWeek: number; // aligned velocity series
};

export type DirectoryRow = {
  directory: string;
  files: number;
  stabilized: number;
  ratio: number; // 0.0–1.0
  churn: number;
};

export type ChurnFileRow = {
  path: string;
  touches: number;
  lines: number;
  fixes: number;
};

export const sampleReport = {
  repo: "acme/order-platform",
  windowDays: 90,
  churnDays: 14,

  headline: {
    commitsTotal: 161,
    filesTouched: 171,
    filesStabilized: 66,
    stabilizationRatio: 0.386,
    revertRate: 0.006,
    churnEvents: 105,
    churnLinesAffected: 21752,
  },

  pr: {
    merged: 34,
    medianTimeToMergeHours: 36.8,
    medianSizeFiles: 13,
    medianSizeLines: 679,
    medianReviewRounds: 0.0,
    singlePassRate: 0.94,
  },

  cascade: {
    rate: 0.30,
    medianDepth: 2.0,
    commits: 128,
    cascades: 38,
  },

  durability: {
    linesIntroduced: 12192,
    linesSurviving: 9761,
    survivalRate: 0.80,
    medianAgeDays: 30,
  },

  velocity: {
    commitsPerWeek: 16.1,
    linesPerWeek: 2698.9,
    trend: "accelerating" as const,
    trendChangePct: 1.32, // +132%
    durabilityCorrelation: "negative" as const,
  },

  intents: [
    { intent: "FEATURE", commits: 91, linesChanged: 22164, stabilization: 0.58, churnEvents: 65 },
    { intent: "FIX", commits: 24, linesChanged: 555, stabilization: 0.52, churnEvents: 10 },
    { intent: "REFACTOR", commits: 10, linesChanged: 3348, stabilization: 0.62, churnEvents: 33 },
    { intent: "CONFIG", commits: 33, linesChanged: 274, stabilization: 0.78, churnEvents: 2 },
    { intent: "UNKNOWN", commits: 3, linesChanged: 587, stabilization: 1.0, churnEvents: 0 },
  ] satisfies IntentRow[],

  weeks: [
    { weekStart: "01-12", commits: 5, loc: 1609, featurePct: 0.20, fixPct: 0.40, stabilization: 0.79, churn: 4, commitsPerWeek: 4.0 },
    { weekStart: "01-19", commits: 1, loc: 6, featurePct: 0.00, fixPct: 0.00, stabilization: null, churn: 0, commitsPerWeek: 4.0 },
    { weekStart: "01-26", commits: 5, loc: 136, featurePct: 0.20, fixPct: 0.40, stabilization: 0.70, churn: 3, commitsPerWeek: 14.0 },
    { weekStart: "02-02", commits: 15, loc: 2187, featurePct: 0.53, fixPct: 0.00, stabilization: 0.61, churn: 7, commitsPerWeek: 14.0 },
    { weekStart: "02-09", commits: 12, loc: 1913, featurePct: 0.58, fixPct: 0.00, stabilization: 0.79, churn: 6, commitsPerWeek: 9.0 },
    { weekStart: "02-16", commits: 11, loc: 3778, featurePct: 0.64, fixPct: 0.09, stabilization: 0.58, churn: 10, commitsPerWeek: 9.0 },
    { weekStart: "02-23", commits: 5, loc: 585, featurePct: 0.40, fixPct: 0.40, stabilization: 0.79, churn: 10, commitsPerWeek: 31.5 },
    { weekStart: "03-02", commits: 54, loc: 11038, featurePct: 0.69, fixPct: 0.19, stabilization: 0.59, churn: 45, commitsPerWeek: 31.5 },
    { weekStart: "03-09", commits: 12, loc: 2827, featurePct: 0.75, fixPct: 0.00, stabilization: 0.74, churn: 22, commitsPerWeek: 22.0 },
    { weekStart: "03-16", commits: 17, loc: 1456, featurePct: 0.71, fixPct: 0.00, stabilization: 0.61, churn: 12, commitsPerWeek: 22.0 },
    { weekStart: "03-23", commits: 24, loc: 1393, featurePct: 0.29, fixPct: 0.29, stabilization: 0.39, churn: 17, commitsPerWeek: 22.0 },
  ] satisfies WeekRow[],

  stabilityMap: [
    { directory: "internal/handlers", files: 3, stabilized: 0, ratio: 0.00, churn: 3 },
    { directory: "internal/orders", files: 3, stabilized: 0, ratio: 0.00, churn: 3 },
    { directory: "internal/message", files: 16, stabilized: 2, ratio: 0.12, churn: 14 },
    { directory: "charts/order-platform", files: 7, stabilized: 1, ratio: 0.14, churn: 6 },
    { directory: "internal/integrations", files: 45, stabilized: 7, ratio: 0.16, churn: 38 },
    { directory: "internal/app", files: 3, stabilized: 1, ratio: 0.33, churn: 2 },
    { directory: "internal/payments", files: 3, stabilized: 1, ratio: 0.33, churn: 2 },
    { directory: "internal/gds", files: 4, stabilized: 2, ratio: 0.50, churn: 2 },
    { directory: "internal/common", files: 23, stabilized: 13, ratio: 0.56, churn: 10 },
    { directory: ".github/workflows", files: 3, stabilized: 2, ratio: 0.67, churn: 1 },
    { directory: "docs", files: 4, stabilized: 3, ratio: 0.75, churn: 1 },
    { directory: "docs/flows", files: 7, stabilized: 7, ratio: 1.00, churn: 0 },
    { directory: "pkg/metrics", files: 3, stabilized: 3, ratio: 1.00, churn: 0 },
  ] satisfies DirectoryRow[],

  topChurningFiles: [
    { path: "charts/order-platform/values.yaml", touches: 40, lines: 194, fixes: 4 },
    { path: "internal/app/application.go", touches: 29, lines: 738, fixes: 3 },
    { path: "internal/integrations/gateway/client.go", touches: 24, lines: 1967, fixes: 0 },
    { path: "charts/order-platform/Chart.yaml", touches: 24, lines: 96, fixes: 0 },
    { path: "internal/orders/processor.go", touches: 23, lines: 1876, fixes: 1 },
    { path: "pkg/config/config.go", touches: 18, lines: 273, fixes: 0 },
    { path: "charts/order-platform/environments/eu/values.yaml", touches: 18, lines: 171, fixes: 4 },
    { path: "internal/orders/events.go", touches: 17, lines: 530, fixes: 3 },
  ] satisfies ChurnFileRow[],

  trend: {
    prTimeToMergeHoursBaseline: 36.8,
    prTimeToMergeHoursRecent: 99.8,
  },
} as const;
