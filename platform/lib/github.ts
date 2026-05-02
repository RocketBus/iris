/**
 * Lightweight GitHub API client for Iris server-side usage.
 * Tokens come from the user's NextAuth session.
 */

const API = 'https://api.github.com';

export interface GitHubOrgSummary {
  id: number;
  login: string;
  name: string | null;
  description: string | null;
  avatarUrl: string;
}

interface RawOrg {
  id: number;
  login: string;
  description: string | null;
  avatar_url: string;
}

interface RawOrgDetail {
  name: string | null;
}

async function call<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'iris-platform',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export interface GitHubMember {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string;
}

interface RawMember {
  id: number;
  login: string;
  avatar_url: string;
}

interface RawUserDetail {
  name: string | null;
}

function parseLinkHeader(header: string | null): Record<string, string> {
  if (!header) return {};
  const links: Record<string, string> = {};
  for (const part of header.split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match) links[match[2]] = match[1];
  }
  return links;
}

async function callRaw(url: string, accessToken: string): Promise<Response> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'iris-platform',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status} on ${url}: ${body.slice(0, 200)}`);
  }
  return res;
}

/**
 * Returns the public + visible members of a GitHub org. Requires `read:org`
 * scope; users not granted private member visibility will only show up if they
 * are public members of the org.
 */
export async function listOrgMembers(
  orgLogin: string,
  accessToken: string,
  { fetchNames = false }: { fetchNames?: boolean } = {},
): Promise<GitHubMember[]> {
  const all: RawMember[] = [];
  let url: string | null = `${API}/orgs/${orgLogin}/members?per_page=100`;
  while (url) {
    const res = await callRaw(url, accessToken);
    const page = (await res.json()) as RawMember[];
    all.push(...page);
    const links = parseLinkHeader(res.headers.get('link'));
    url = links.next ?? null;
  }

  if (!fetchNames) {
    return all.map((m) => ({
      id: m.id,
      login: m.login,
      name: null,
      avatarUrl: m.avatar_url,
    }));
  }

  // Optional name resolution — costs one request per member, so callers opt in.
  return Promise.all(
    all.map(async (m) => {
      let name: string | null = null;
      try {
        const res = await callRaw(`${API}/users/${m.login}`, accessToken);
        const detail = (await res.json()) as RawUserDetail;
        name = detail.name;
      } catch {
        // non-fatal
      }
      return {
        id: m.id,
        login: m.login,
        name,
        avatarUrl: m.avatar_url,
      } satisfies GitHubMember;
    }),
  );
}

/**
 * Returns orgs the user belongs to. Requires `read:org` scope.
 *
 * Note: GitHub's /user/orgs only returns public orgs by default; private orgs
 * are included when the OAuth grant has read:org and the user has approved
 * org access. Orgs that require SAML/SSO without an active session may be
 * omitted by GitHub — that's a GitHub-side gate, not something we can fix.
 */
export async function listUserOrgs(accessToken: string): Promise<GitHubOrgSummary[]> {
  const raws = await call<RawOrg[]>('/user/orgs?per_page=100', accessToken);

  // Fill in display names with one extra call per org. We cap at 100 by API
  // limits anyway, and most users belong to a handful of orgs.
  const detailed = await Promise.all(
    raws.map(async (raw) => {
      let name: string | null = null;
      try {
        const detail = await call<RawOrgDetail>(`/orgs/${raw.login}`, accessToken);
        name = detail.name;
      } catch {
        // Non-fatal: keep going with the login as the displayable name.
      }
      return {
        id: raw.id,
        login: raw.login,
        name,
        description: raw.description,
        avatarUrl: raw.avatar_url,
      } satisfies GitHubOrgSummary;
    }),
  );

  return detailed;
}
