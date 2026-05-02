/**
 * Cookie that holds the GitHub org selection between the selector step and
 * provisioning. Short-lived because it's just a hand-off, never
 * authoritative state — the source of truth lives on `organizations.github_*`.
 */

export const PENDING_GITHUB_ORG_COOKIE = 'iris_pending_github_org';
export const PENDING_GITHUB_ORG_COOKIE_MAX_AGE = 60 * 30; // 30 minutes

export interface PendingGitHubOrg {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string;
}

export function parsePendingGitHubOrg(raw: string | undefined | null): PendingGitHubOrg | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<PendingGitHubOrg>;
    if (
      typeof parsed.id !== 'number' ||
      typeof parsed.login !== 'string' ||
      typeof parsed.avatarUrl !== 'string'
    ) {
      return null;
    }
    return {
      id: parsed.id,
      login: parsed.login,
      name: typeof parsed.name === 'string' ? parsed.name : null,
      avatarUrl: parsed.avatarUrl,
    };
  } catch {
    return null;
  }
}
