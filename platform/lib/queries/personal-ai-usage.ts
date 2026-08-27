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

export interface AuthorIdentity {
  name: string;
  email: string | null;
}

export interface PerRepoUsage {
  organizationSlug: string;
  organizationName: string;
  repositoryName: string;
  repositoryId: string;
  aiCommitPct: number;
  totalCommits: number;
  matchedIdentities: AuthorIdentity[];
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

type PayloadAuthor = NonNullable<
  ReportMetrics["author_velocity"]
>["authors"][number];

interface MatchedAuthor {
  author: PayloadAuthor;
  matchedBy: "email" | "name";
}

interface AggregatedUsage {
  totalCommits: number;
  aiCommitPct: number;
  highVelocityWeeks: number;
  matchedBy: "email" | "name";
  identities: AuthorIdentity[];
}

interface WeekTotals {
  commits: number;
  aiCommits: number;
  hasAiData: boolean;
}

function nameKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Every author row in `payload` that belongs to the current user.
 *
 * One person routinely commits under more than one git identity in the same
 * repo: the local `git config user.email` for their own work, and the GitHub
 * account's primary email for merges and edits made through the web UI.
 * Returning only the first hit pins the user to whichever identity happens to
 * come first, so a one-commit identity can hide a several-hundred-commit one
 * and report 0% AI for an otherwise fully AI-assisted repo (issue #193).
 *
 * Email is the reliable signal — git deduplicates authors by email and the
 * engine preserves it on every row. A display-name hit still counts, so users
 * whose account email covers none of their git identities are not left empty,
 * but it is reported back so callers can warn that it may be a namesake.
 */
function matchUserAuthors(
  payload: ReportMetrics | null,
  emailCandidates: Set<string>,
  nameCandidates: Set<string>,
): MatchedAuthor[] {
  const authors = payload?.author_velocity?.authors;
  if (!authors) return [];

  const matched: MatchedAuthor[] = [];
  for (const author of authors) {
    if (author.email && emailCandidates.has(nameKey(author.email))) {
      matched.push({ author, matchedBy: "email" });
    } else if (nameCandidates.has(nameKey(author.name))) {
      matched.push({ author, matchedBy: "name" });
    }
  }
  return matched;
}

/**
 * Collapse the user's identities within one push into the single row the
 * per-repo table shows.
 *
 * `aiCommitPct` is weighted by commit count so a stray one-commit identity
 * cannot drag the share of a large one down. Payloads from iris < 1.0.2 carry
 * no `total_commits`, which leaves every weight at zero — those fall back to
 * the plain mean, matching what a single-author match used to display.
 *
 * `highVelocityWeeks` takes the maximum rather than the sum: the engine counts
 * weeks, and the same calendar week can appear under two identities. Summing
 * would double-count it, and recomputing from `weekly` would duplicate the
 * engine's threshold logic here.
 *
 * `matchedBy` reports "email" only when every identity matched on email. If
 * any part of the row rests on a display-name match, the whole row carries the
 * weaker guarantee and the UI should say so.
 */
function aggregateAuthors(matches: MatchedAuthor[]): AggregatedUsage | null {
  if (matches.length === 0) return null;

  let totalCommits = 0;
  let weightedPctSum = 0;
  let plainPctSum = 0;
  let highVelocityWeeks = 0;
  let everyMatchByEmail = true;
  const identities: AuthorIdentity[] = [];

  for (const { author, matchedBy } of matches) {
    const commits = author.total_commits ?? 0;
    totalCommits += commits;
    weightedPctSum += author.ai_commit_pct * commits;
    plainPctSum += author.ai_commit_pct;
    highVelocityWeeks = Math.max(highVelocityWeeks, author.high_velocity_weeks);
    if (matchedBy === "name") everyMatchByEmail = false;
    identities.push({ name: author.name, email: author.email ?? null });
  }

  return {
    totalCommits,
    aiCommitPct:
      totalCommits > 0
        ? weightedPctSum / totalCommits
        : plainPctSum / matches.length,
    highVelocityWeeks,
    matchedBy: everyMatchByEmail ? "email" : "name",
    identities,
  };
}

/**
 * Merge one push's weekly arrays across every identity the user commits under,
 * so a week split between two identities becomes a single entry instead of two
 * competing ones.
 */
function mergeWeeklyAcrossIdentities(
  matches: MatchedAuthor[],
): Map<string, WeekTotals> {
  const merged = new Map<string, WeekTotals>();

  for (const { author } of matches) {
    for (const week of author.weekly ?? []) {
      const totals = merged.get(week.week_start) ?? {
        commits: 0,
        aiCommits: 0,
        hasAiData: false,
      };
      totals.commits += week.commits;
      if (typeof week.ai_commits === "number") {
        totals.aiCommits += week.ai_commits;
        totals.hasAiData = true;
      }
      merged.set(week.week_start, totals);
    }
  }

  return merged;
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
      const matches = matchUserAuthors(
        row.payload,
        emailCandidates,
        nameCandidates,
      );
      if (matches.length === 0) continue;

      for (const [weekStart, totals] of mergeWeeklyAcrossIdentities(matches)) {
        if (seenWeeks.has(weekStart)) continue;
        seenWeeks.add(weekStart);

        const bucket: WeekBucket = weekly.get(weekStart) ?? {
          commits: 0,
          aiCommits: 0,
          repoIds: new Set(),
          hasAiData: false,
        };
        bucket.commits += totals.commits;
        bucket.aiCommits += totals.aiCommits;
        if (totals.hasAiData) bucket.hasAiData = true;
        bucket.repoIds.add(repoId);
        weekly.set(weekStart, bucket);
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
    const usage = aggregateAuthors(
      matchUserAuthors(row.payload, emailCandidates, nameCandidates),
    );
    if (!usage) continue;
    const repo = repoIndex.get(repoId);
    const org = orgIndex.get(row.organization_id);
    if (!repo || !org) continue;

    perRepo.push({
      organizationSlug: org.slug,
      organizationName: org.name,
      repositoryName: repo.name,
      repositoryId: repoId,
      aiCommitPct: usage.aiCommitPct,
      totalCommits: usage.totalCommits,
      matchedIdentities: usage.identities,
      matchedBy: usage.matchedBy,
      highVelocityWeeks: usage.highVelocityWeeks,
      lastSeenAt: row.created_at,
    });
    aiSum += usage.aiCommitPct;
    aiCount += 1;
    if (usage.highVelocityWeeks > maxHv) maxHv = usage.highVelocityWeeks;
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
