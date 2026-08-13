/**
 * User-scoped query for /me/ai-usage. Aggregates a single user's AI footprint
 * across every organization they belong to. Strictly self-only — no cross-user
 * comparison, no ranking. See CLAUDE.md principle #2.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_WINDOW_DAYS } from "@/lib/queries/temporal";
import type { ReportMetrics } from "@/types/metrics";

// How many historical pushes per repo to pull when reconstructing the trend
// chart. Each push's weekly array already covers DEFAULT_WINDOW_DAYS, so a
// handful of pushes goes a long way — this is a cap on ingestion cadence
// (typically one push per CI run), not on calendar days of history.
const HISTORY_DEPTH = 12;

export interface PerRepoUsage {
  organizationSlug: string;
  organizationName: string;
  repositoryName: string;
  repositoryId: string;
  aiCommitPct: number;
  totalCommits: number;
  matchedAuthorName: string;
  matchedAuthorEmail: string | null;
  matchedBy: "email" | "name";
  highVelocityWeeks: number;
  lastSeenAt: string;
}

export interface UsageTrendPoint {
  date: string;
  aiCommitPct: number | null;
  repos: number;
}

export interface PersonalAIUsage {
  matched: boolean;
  totalRepos: number;
  totalOrgs: number;
  avgAiCommitPct: number | null;
  maxHighVelocityWeeks: number;
  perRepo: PerRepoUsage[];
  trend: UsageTrendPoint[];
}

interface OrgInput {
  id: string;
  slug: string;
  name: string;
}

export interface MetricRow {
  repository_id: string;
  payload: ReportMetrics | null;
  created_at: string;
  organization_id: string;
}

interface RepoRow {
  id: string;
  name: string;
  organization_id: string;
}

function nameKey(value: string): string {
  return value.trim().toLowerCase();
}

// Match the current user against the engine's per-author rows. Email is the
// reliable identity — git deduplicates authors by email and the engine
// preserves it on every row. Name match remains as a fallback for older
// payloads (pre-email field) and for authors whose commits lack an email
// (rare, falls back to author string). Returning the matched method lets
// callers expose it in the UI so the user can sanity-check what attributed
// to them.
function pickUserAuthor(
  payload: ReportMetrics | null,
  emailCandidates: Set<string>,
  nameCandidates: Set<string>,
): {
  author: NonNullable<ReportMetrics["author_velocity"]>["authors"][number];
  matchedBy: "email" | "name";
} | null {
  const authors = payload?.author_velocity?.authors;
  if (!authors) return null;
  for (const a of authors) {
    if (a.email && emailCandidates.has(nameKey(a.email))) {
      return { author: a, matchedBy: "email" };
    }
  }
  for (const a of authors) {
    if (nameCandidates.has(nameKey(a.name))) {
      return { author: a, matchedBy: "name" };
    }
  }
  return null;
}

// Weekly AI commit share aggregated across each repo's full fetched history,
// not just its latest payload — a single push's weekly array only covers
// that push's own analysis window, so relying on it alone caps the chart at
// ~DEFAULT_WINDOW_DAYS of visible history no matter how long the user has
// been active. Bucket by ACTUAL commit week
// (author_velocity.authors[].weekly.week_start), not by metrics ingestion
// timestamp — otherwise a first-time push of N repos all on the same day
// collapses into one bucket and the chart shows "insufficient data" even
// though months of history are sitting in the payload. ai_commits per week
// is emitted by iris >= 1.0.2; older payloads contribute commit counts but
// no AI share for those weeks.
export function buildUsageTrend(
  rowsPerRepo: Map<string, MetricRow[]>,
  emailCandidates: Set<string>,
  nameCandidates: Set<string>,
): UsageTrendPoint[] {
  type WeekBucket = {
    commits: number;
    aiCommits: number;
    repoIds: Set<string>;
    hasAiData: boolean;
  };
  const weekly = new Map<string, WeekBucket>();

  for (const [repoId, rows] of rowsPerRepo) {
    // Overlapping pushes can report the same week differently as commit
    // history is amended/rebased; rows are newest-first, so the first value
    // seen per week wins and older pushes' values for that same week are
    // skipped.
    const seenWeeks = new Set<string>();
    for (const row of rows) {
      const match = pickUserAuthor(
        row.payload,
        emailCandidates,
        nameCandidates,
      );
      if (!match?.author.weekly) continue;
      for (const w of match.author.weekly) {
        if (seenWeeks.has(w.week_start)) continue;
        seenWeeks.add(w.week_start);

        const bucket: WeekBucket = weekly.get(w.week_start) ?? {
          commits: 0,
          aiCommits: 0,
          repoIds: new Set(),
          hasAiData: false,
        };
        bucket.commits += w.commits;
        if (typeof w.ai_commits === "number") {
          bucket.aiCommits += w.ai_commits;
          bucket.hasAiData = true;
        }
        bucket.repoIds.add(repoId);
        weekly.set(w.week_start, bucket);
      }
    }
  }

  return [...weekly.entries()]
    .map(([date, b]) => ({
      date,
      aiCommitPct:
        b.hasAiData && b.commits > 0 ? (b.aiCommits / b.commits) * 100 : null,
      repos: b.repoIds.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getPersonalAIUsage(
  supabase: SupabaseClient,
  user: { name: string | null; email: string | null },
  orgs: OrgInput[],
): Promise<PersonalAIUsage> {
  const empty: PersonalAIUsage = {
    matched: false,
    totalRepos: 0,
    totalOrgs: 0,
    avgAiCommitPct: null,
    maxHighVelocityWeeks: 0,
    perRepo: [],
    trend: [],
  };

  if (orgs.length === 0) return empty;

  // Email match is the reliable identity. Name match is a fallback for
  // older payloads (pre-email field) and unusual cases.
  const emailCandidates = new Set<string>();
  if (user.email) emailCandidates.add(nameKey(user.email));

  const nameCandidates = new Set<string>();
  if (user.name) nameCandidates.add(nameKey(user.name));
  if (user.email) {
    const localPart = user.email.split("@")[0];
    if (localPart) nameCandidates.add(nameKey(localPart));
  }
  if (emailCandidates.size === 0 && nameCandidates.size === 0) return empty;

  const orgIds = orgs.map((o) => o.id);
  const orgIndex = new Map(orgs.map((o) => [o.id, o]));

  // Fetch repositories so we can resolve names without joining.
  const { data: repoRows } = await supabase
    .from("repositories")
    .select("id, name, organization_id")
    .in("organization_id", orgIds);
  const repos = (repoRows ?? []) as RepoRow[];
  const repoIndex = new Map(repos.map((r) => [r.id, r]));

  // Fetch metrics across all of the user's orgs. Multiple rows per repo are
  // kept (not just the latest) so the trend below can reconstruct real
  // history across pushes instead of being limited to one payload's own
  // analysis window. Filter by window_days so multi-window ingestion (issue
  // #80) doesn't pull older AI footprints from a different analysis window
  // into the same view.
  const { data: metricRows } = await supabase
    .from("metrics")
    .select("repository_id, payload, created_at, organization_id")
    .in("organization_id", orgIds)
    .eq("window_days", DEFAULT_WINDOW_DAYS)
    .order("created_at", { ascending: false })
    .limit(repos.length * HISTORY_DEPTH);
  const metrics = (metricRows ?? []) as MetricRow[];

  // All rows per repo, newest first (source query is already DESC-ordered).
  const rowsPerRepo = new Map<string, MetricRow[]>();
  for (const m of metrics) {
    const rows = rowsPerRepo.get(m.repository_id);
    if (rows) rows.push(m);
    else rowsPerRepo.set(m.repository_id, [m]);
  }

  const perRepo: PerRepoUsage[] = [];
  let aiSum = 0;
  let aiCount = 0;
  let maxHv = 0;

  for (const [repoId, rows] of rowsPerRepo) {
    const row = rows[0]; // newest row — summary table shows current snapshot only.
    const match = pickUserAuthor(row.payload, emailCandidates, nameCandidates);
    if (!match) continue;
    const repo = repoIndex.get(repoId);
    const org = orgIndex.get(row.organization_id);
    if (!repo || !org) continue;

    perRepo.push({
      organizationSlug: org.slug,
      organizationName: org.name,
      repositoryName: repo.name,
      repositoryId: repoId,
      aiCommitPct: match.author.ai_commit_pct,
      totalCommits: match.author.total_commits ?? 0,
      matchedAuthorName: match.author.name,
      matchedAuthorEmail: match.author.email ?? null,
      matchedBy: match.matchedBy,
      highVelocityWeeks: match.author.high_velocity_weeks,
      lastSeenAt: row.created_at,
    });
    aiSum += match.author.ai_commit_pct;
    aiCount += 1;
    if (match.author.high_velocity_weeks > maxHv)
      maxHv = match.author.high_velocity_weeks;
  }

  const trend = buildUsageTrend(rowsPerRepo, emailCandidates, nameCandidates);

  perRepo.sort((a, b) => b.aiCommitPct - a.aiCommitPct);

  const distinctOrgs = new Set(perRepo.map((r) => r.organizationSlug));

  return {
    matched: perRepo.length > 0,
    totalRepos: perRepo.length,
    totalOrgs: distinctOrgs.size,
    avgAiCommitPct: aiCount > 0 ? aiSum / aiCount : null,
    maxHighVelocityWeeks: maxHv,
    perRepo,
    trend,
  };
}
