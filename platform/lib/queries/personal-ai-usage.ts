/**
 * User-scoped query for /me/ai-usage. Aggregates a single user's AI footprint
 * across every organization they belong to. Strictly self-only — no cross-user
 * comparison, no ranking. See CLAUDE.md principle #2.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ReportMetrics } from "@/types/metrics";

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

interface MetricRow {
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

function bucketWeek(iso: string): string {
  const d = new Date(iso);
  // Snap to ISO week start (Monday) — UTC for stability.
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
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

  // Fetch metrics across all of the user's orgs. Cap by a reasonable history.
  const { data: metricRows } = await supabase
    .from("metrics")
    .select("repository_id, payload, created_at, organization_id")
    .in("organization_id", orgIds)
    .order("created_at", { ascending: false })
    .limit(orgs.length * 50);
  const metrics = (metricRows ?? []) as MetricRow[];

  // Latest payload per repo
  const latestPerRepo = new Map<string, MetricRow>();
  for (const m of metrics) {
    if (!latestPerRepo.has(m.repository_id)) {
      latestPerRepo.set(m.repository_id, m);
    }
  }

  const perRepo: PerRepoUsage[] = [];
  let aiSum = 0;
  let aiCount = 0;
  let maxHv = 0;

  for (const [repoId, row] of latestPerRepo) {
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

  // Trend: weekly average AI % across the user's repos, oldest → newest.
  const weekly = new Map<
    string,
    { sum: number; count: number; repoIds: Set<string> }
  >();
  for (const m of metrics) {
    const match = pickUserAuthor(m.payload, emailCandidates, nameCandidates);
    if (!match) continue;
    const week = bucketWeek(m.created_at);
    const bucket = weekly.get(week) ?? { sum: 0, count: 0, repoIds: new Set() };
    bucket.sum += match.author.ai_commit_pct;
    bucket.count += 1;
    bucket.repoIds.add(m.repository_id);
    weekly.set(week, bucket);
  }

  const trend: UsageTrendPoint[] = [...weekly.entries()]
    .map(([date, b]) => ({
      date,
      aiCommitPct: b.count > 0 ? b.sum / b.count : null,
      repos: b.repoIds.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

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
