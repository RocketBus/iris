/**
 * GitHub Projects V2 GraphQL client.
 *
 * Two reads, both validated against the live API:
 *
 * 1. `fetchProjectItems` — the board's current state: every item with its
 *    Status/Iteration/Priority/Size field values and its content (Issue,
 *    PullRequest or DraftIssue).
 *
 * 2. `fetchStatusHistory` — the transition history, from
 *    `ProjectV2ItemStatusChangedEvent` on the *content's* timeline. This is
 *    what makes phase durations computable retroactively; see the header of
 *    migration 023 for why there is no snapshot mechanism here.
 *
 * Two API facts shape this file:
 *
 * - History hangs off the Issue/PullRequest, not off the board item. Drafts
 *   have no timeline at all, so they yield no history — never a zero.
 * - An issue's timeline carries events from *every* project it belongs to, so
 *   each event must be filtered by `project.id`. Skipping that filter mixes
 *   other teams' boards into this board's numbers.
 */

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

/** Items per page. Kept modest because `fieldValues` multiplies node cost. */
const ITEMS_PAGE_SIZE = 50;
/** Content ids per history request. */
const HISTORY_BATCH_SIZE = 20;
/** Timeline events per page. */
const TIMELINE_PAGE_SIZE = 100;
/** Safety valve against a pathological board pinning the sync forever. */
const MAX_ITEM_PAGES = 200;
const MAX_TIMELINE_PAGES = 20;

export interface GitHubProjectsCredentials {
  /** Token with `read:project` (plus `repo` for private repo content). */
  token: string;
}

export interface BoardRef {
  ownerLogin: string;
  ownerType: "organization" | "user";
  /** The project number as it appears in the URL. */
  number: number;
}

export type ProjectContentType = "ISSUE" | "PULL_REQUEST" | "DRAFT_ISSUE";

export interface RawProjectItem {
  /** Board item node id ("PVTI_..."). */
  itemId: string;
  /** Content node id ("I_..."), absent for drafts — they have no timeline. */
  contentId: string | null;
  contentType: ProjectContentType;
  contentRepo: string | null;
  contentNumber: number | null;
  title: string;
  /** OPEN | CLOSED | MERGED; null for drafts. */
  contentState: string | null;
  createdAt: string | null;
  closedAt: string | null;
  itemUpdatedAt: string | null;
  status: string | null;
  iteration: string | null;
  priority: string | null;
  size: string | null;
  assignees: string[];
  labels: string[];
}

export interface RawBoard {
  projectId: string;
  title: string;
  items: RawProjectItem[];
}

export type StatusEventKind = "ADDED" | "STATUS_CHANGED" | "REMOVED";

export interface RawStatusEvent {
  /** Timeline event node id — the idempotency key for persistence. */
  eventId: string;
  contentId: string;
  kind: StatusEventKind;
  /** "" when GitHub reports no prior column; null on ADDED/REMOVED. */
  previousStatus: string | null;
  status: string | null;
  occurredAt: string;
  wasAutomated: boolean;
  actorLogin: string | null;
}

export interface StatusHistory {
  eventsByContentId: Map<string, RawStatusEvent[]>;
  /** Content ids whose timeline had more pages than we walked. */
  truncatedContentIds: Set<string>;
}

export class GitHubProjectsError extends Error {}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/**
 * POST a GraphQL document. GitHub answers 200 with an `errors` array for
 * query-level problems, so a non-throwing fetch is not a success.
 *
 * `NOT_FOUND` on individual `nodes` entries is tolerated by the caller (a
 * deleted issue), which is why partial data is returned alongside errors
 * rather than raising unconditionally.
 */
async function graphql<T>(
  creds: GitHubProjectsCredentials,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(GITHUB_GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `bearer ${creds.token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
        "User-Agent": "iris-github-projects",
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new GitHubProjectsError(`GitHub GraphQL request failed: ${detail}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new GitHubProjectsError(
      `GitHub rejected the token (HTTP ${response.status}). ` +
        "The integration needs `read:project` on the owner.",
    );
  }
  if (response.status === 429 || response.status >= 500) {
    throw new GitHubProjectsError(
      `GitHub GraphQL unavailable (HTTP ${response.status}).`,
    );
  }
  if (!response.ok) {
    throw new GitHubProjectsError(`GitHub GraphQL HTTP ${response.status}.`);
  }

  const body = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string; type?: string }>;
  };

  if (body.errors?.length) {
    // Missing nodes are expected (deleted content); anything else is fatal.
    const fatal = body.errors.filter((e) => e.type !== "NOT_FOUND");
    if (fatal.length > 0 || !body.data) {
      throw new GitHubProjectsError(
        `GitHub GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`,
      );
    }
  }

  if (!body.data) {
    throw new GitHubProjectsError("GitHub GraphQL returned no data.");
  }
  return body.data;
}

// ---------------------------------------------------------------------------
// 1. Board state
// ---------------------------------------------------------------------------

const ITEM_FIELDS = `
  id
  type
  updatedAt
  fieldValues(first: 20) {
    nodes {
      __typename
      ... on ProjectV2ItemFieldSingleSelectValue {
        name
        field { ... on ProjectV2SingleSelectField { name } }
      }
      ... on ProjectV2ItemFieldIterationValue {
        title
        field { ... on ProjectV2IterationField { name } }
      }
      ... on ProjectV2ItemFieldTextValue {
        text
        field { ... on ProjectV2Field { name } }
      }
    }
  }
  content {
    __typename
    ... on Issue {
      id number title state createdAt closedAt
      repository { nameWithOwner }
      assignees(first: 10) { nodes { login } }
      labels(first: 20) { nodes { name } }
    }
    ... on PullRequest {
      id number title state createdAt closedAt
      repository { nameWithOwner }
      assignees(first: 10) { nodes { login } }
      labels(first: 20) { nodes { name } }
    }
    ... on DraftIssue {
      id title createdAt updatedAt
      assignees(first: 10) { nodes { login } }
    }
  }
`;

function itemsQuery(ownerType: "organization" | "user"): string {
  return `
    query ProjectItems($login: String!, $number: Int!, $cursor: String) {
      ${ownerType}(login: $login) {
        projectV2(number: $number) {
          id
          title
          items(first: ${ITEMS_PAGE_SIZE}, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes { ${ITEM_FIELDS} }
          }
        }
      }
    }
  `;
}

interface RawFieldValue {
  __typename: string;
  name?: string;
  title?: string;
  text?: string;
  field?: { name?: string };
}

interface RawItemNode {
  id: string;
  type: string;
  updatedAt: string | null;
  fieldValues: { nodes: Array<RawFieldValue | null> };
  content: {
    __typename: string;
    id?: string;
    number?: number;
    title?: string;
    state?: string;
    createdAt?: string;
    closedAt?: string | null;
    updatedAt?: string;
    repository?: { nameWithOwner?: string };
    assignees?: { nodes: Array<{ login: string }> };
    labels?: { nodes: Array<{ name: string }> };
  } | null;
}

/** Field names are per-board free text; match case-insensitively. */
function readField(
  values: Array<RawFieldValue | null>,
  fieldName: string,
): string | null {
  const wanted = fieldName.toLowerCase();
  for (const v of values) {
    if (!v?.field?.name) continue;
    if (v.field.name.toLowerCase() !== wanted) continue;
    return v.name ?? v.title ?? v.text ?? null;
  }
  return null;
}

function toContentType(typename: string | undefined): ProjectContentType {
  if (typename === "Issue") return "ISSUE";
  if (typename === "PullRequest") return "PULL_REQUEST";
  return "DRAFT_ISSUE";
}

function parseItem(node: RawItemNode): RawProjectItem {
  const content = node.content;
  const values = node.fieldValues?.nodes ?? [];
  const contentType = toContentType(content?.__typename);
  const isDraft = contentType === "DRAFT_ISSUE";

  return {
    itemId: node.id,
    // Drafts get no contentId: without one, the history fetch skips them
    // instead of asking for a timeline that cannot exist.
    contentId: isDraft ? null : (content?.id ?? null),
    contentType,
    contentRepo: content?.repository?.nameWithOwner ?? null,
    contentNumber: content?.number ?? null,
    // The Title *field* wins over content title only when content is absent;
    // a draft's title lives on the content itself.
    title: content?.title ?? readField(values, "Title") ?? "(untitled)",
    contentState: isDraft ? null : (content?.state ?? null),
    createdAt: content?.createdAt ?? null,
    closedAt: content?.closedAt ?? null,
    itemUpdatedAt: node.updatedAt ?? null,
    status: readField(values, "Status"),
    iteration: readField(values, "Iteration"),
    priority: readField(values, "Priority"),
    size: readField(values, "Size") ?? readField(values, "Estimate"),
    assignees: (content?.assignees?.nodes ?? []).map((a) => a.login),
    labels: (content?.labels?.nodes ?? []).map((l) => l.name),
  };
}

interface ProjectPayload {
  projectV2: {
    id: string;
    title: string;
    items: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<RawItemNode | null>;
    };
  } | null;
}

interface ProjectItemsResponse {
  organization?: ProjectPayload | null;
  user?: ProjectPayload | null;
}

/** Fetch every item on a board, paginating until exhausted. */
export async function fetchProjectItems(
  creds: GitHubProjectsCredentials,
  board: BoardRef,
): Promise<RawBoard> {
  const query = itemsQuery(board.ownerType);
  const items: RawProjectItem[] = [];
  let cursor: string | null = null;
  let projectId = "";
  let title = "";

  for (let page = 0; page < MAX_ITEM_PAGES; page++) {
    const data: ProjectItemsResponse = await graphql<ProjectItemsResponse>(
      creds,
      query,
      { login: board.ownerLogin, number: board.number, cursor },
    );

    const project = (data.organization ?? data.user)?.projectV2;
    if (!project) {
      throw new GitHubProjectsError(
        `Project ${board.ownerLogin}/${board.number} not found ` +
          "(wrong number, or the token cannot see it).",
      );
    }

    projectId = project.id;
    title = project.title;
    for (const node of project.items.nodes) {
      if (node) items.push(parseItem(node));
    }

    if (!project.items.pageInfo.hasNextPage) break;
    cursor = project.items.pageInfo.endCursor;
  }

  return { projectId, title, items };
}

// ---------------------------------------------------------------------------
// 2. Status history
// ---------------------------------------------------------------------------

const TIMELINE_EVENT_FIELDS = `
  __typename
  ... on ProjectV2ItemStatusChangedEvent {
    id createdAt previousStatus status wasAutomated
    actor { login }
    project { id }
  }
  ... on AddedToProjectV2Event {
    id createdAt wasAutomated
    actor { login }
    project { id }
  }
  ... on RemovedFromProjectV2Event {
    id createdAt wasAutomated
    actor { login }
    project { id }
  }
`;

const TIMELINE_ITEM_TYPES =
  "[PROJECT_V2_ITEM_STATUS_CHANGED_EVENT, ADDED_TO_PROJECT_V2_EVENT, " +
  "REMOVED_FROM_PROJECT_V2_EVENT]";

const HISTORY_QUERY = `
  query ItemHistory($ids: [ID!]!, $cursor: String) {
    nodes(ids: $ids) {
      __typename
      ... on Issue {
        id
        timelineItems(first: ${TIMELINE_PAGE_SIZE}, after: $cursor, itemTypes: ${TIMELINE_ITEM_TYPES}) {
          pageInfo { hasNextPage endCursor }
          nodes { ${TIMELINE_EVENT_FIELDS} }
        }
      }
      ... on PullRequest {
        id
        timelineItems(first: ${TIMELINE_PAGE_SIZE}, after: $cursor, itemTypes: ${TIMELINE_ITEM_TYPES}) {
          pageInfo { hasNextPage endCursor }
          nodes { ${TIMELINE_EVENT_FIELDS} }
        }
      }
    }
  }
`;

interface RawTimelineEvent {
  __typename: string;
  id?: string;
  createdAt?: string;
  previousStatus?: string | null;
  status?: string | null;
  wasAutomated?: boolean;
  actor?: { login?: string } | null;
  project?: { id?: string } | null;
}

interface RawHistoryNode {
  __typename: string;
  id?: string;
  timelineItems?: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<RawTimelineEvent | null>;
  };
}

function eventKind(typename: string): StatusEventKind | null {
  if (typename === "ProjectV2ItemStatusChangedEvent") return "STATUS_CHANGED";
  if (typename === "AddedToProjectV2Event") return "ADDED";
  if (typename === "RemovedFromProjectV2Event") return "REMOVED";
  return null;
}

/**
 * Convert a timeline node into events belonging to `projectId`.
 *
 * The project filter is the important part: an issue tracked on several boards
 * emits status events for all of them onto the same timeline.
 */
function parseEvents(
  contentId: string,
  nodes: Array<RawTimelineEvent | null>,
  projectId: string,
): RawStatusEvent[] {
  const out: RawStatusEvent[] = [];
  for (const node of nodes) {
    if (!node?.id || !node.createdAt) continue;
    if (node.project?.id !== projectId) continue;

    const kind = eventKind(node.__typename);
    if (!kind) continue;

    out.push({
      eventId: node.id,
      contentId,
      kind,
      previousStatus:
        kind === "STATUS_CHANGED" ? (node.previousStatus ?? "") : null,
      status: kind === "STATUS_CHANGED" ? (node.status ?? null) : null,
      occurredAt: node.createdAt,
      wasAutomated: node.wasAutomated ?? false,
      actorLogin: node.actor?.login ?? null,
    });
  }
  return out;
}

/**
 * Fetch status history for the given content ids, batched.
 *
 * Items are fetched in batches sharing one timeline cursor. When any node in a
 * batch reports more pages, that node is re-walked on its own so a single
 * long-lived issue cannot silently truncate its batch mates.
 */
export async function fetchStatusHistory(
  creds: GitHubProjectsCredentials,
  contentIds: string[],
  projectId: string,
): Promise<StatusHistory> {
  const eventsByContentId = new Map<string, RawStatusEvent[]>();
  const truncatedContentIds = new Set<string>();

  const append = (contentId: string, events: RawStatusEvent[]) => {
    const existing = eventsByContentId.get(contentId);
    if (existing) existing.push(...events);
    else eventsByContentId.set(contentId, [...events]);
  };

  for (let i = 0; i < contentIds.length; i += HISTORY_BATCH_SIZE) {
    const batch = contentIds.slice(i, i + HISTORY_BATCH_SIZE);
    const data = await graphql<{ nodes: Array<RawHistoryNode | null> }>(
      creds,
      HISTORY_QUERY,
      { ids: batch, cursor: null },
    );

    for (const node of data.nodes ?? []) {
      // Null node = content deleted since the board read. Not an error.
      if (!node?.id || !node.timelineItems) continue;

      append(
        node.id,
        parseEvents(node.id, node.timelineItems.nodes, projectId),
      );

      if (node.timelineItems.pageInfo.hasNextPage) {
        const remaining = await fetchRemainingTimeline(
          creds,
          node.id,
          node.timelineItems.pageInfo.endCursor,
          projectId,
        );
        append(node.id, remaining.events);
        if (remaining.truncated) truncatedContentIds.add(node.id);
      }
    }
  }

  return { eventsByContentId, truncatedContentIds };
}

async function fetchRemainingTimeline(
  creds: GitHubProjectsCredentials,
  contentId: string,
  startCursor: string | null,
  projectId: string,
): Promise<{ events: RawStatusEvent[]; truncated: boolean }> {
  const events: RawStatusEvent[] = [];
  let cursor = startCursor;

  for (let page = 0; page < MAX_TIMELINE_PAGES; page++) {
    const data = await graphql<{ nodes: Array<RawHistoryNode | null> }>(
      creds,
      HISTORY_QUERY,
      { ids: [contentId], cursor },
    );
    const node = (data.nodes ?? [])[0];
    if (!node?.timelineItems) return { events, truncated: false };

    events.push(...parseEvents(contentId, node.timelineItems.nodes, projectId));

    if (!node.timelineItems.pageInfo.hasNextPage) {
      return { events, truncated: false };
    }
    cursor = node.timelineItems.pageInfo.endCursor;
  }

  return { events, truncated: true };
}
