/**
 * GitHub Projects daily sync.
 *
 * Pulls board state into `project_items` and transition history into
 * `project_status_events`. Idempotent by `provider_item_id` and
 * `provider_event_id`, so repeat runs converge instead of duplicating.
 *
 * History is fetched only for items that can have new history: a board item
 * whose `updatedAt` has not moved since the last sync cannot have gained a
 * status event. That check is what keeps the daily cost proportional to board
 * activity rather than to board size — the first sync backfills everything,
 * every later sync touches the few items that actually moved.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fetchProjectItems,
  fetchStatusHistory,
  type BoardRef,
  type GitHubProjectsCredentials,
  type RawProjectItem,
  type RawStatusEvent,
} from "./client";

import { logger } from "@/lib/debug";
import { decryptCredentials } from "@/lib/encryption";

const PROVIDER = "github_projects" as const;
/** Rows per upsert statement. */
const UPSERT_CHUNK = 500;

/**
 * One board to sync, as stored in `org_integrations.config.boards`.
 *
 * `statusConfig` is optional: when absent, classification falls back to the
 * name heuristics in `lib/queries/board-flow.ts`. Column vocabularies are
 * per-organization, so nothing here assumes a particular workflow.
 */
export interface BoardConfig {
  owner: string;
  ownerType?: "organization" | "user";
  number: number;
  /** Free-form grouping label (team, squad, tribe, product — adopter's call). */
  teamSlug?: string;
  statusConfig?: Record<string, string[]>;
}

export interface SyncOptions {
  /** Inject a clock for testing. */
  now?: () => Date;
  /** Re-fetch history for every item, ignoring `item_updated_at`. */
  forceFullHistory?: boolean;
}

export interface BoardSyncResult {
  boardId: string;
  title: string;
  itemsUpserted: number;
  eventsUpserted: number;
  /** Items whose history was fetched this run. */
  historyFetched: number;
  /** Items that can never have history (drafts). */
  itemsWithoutHistory: number;
}

export interface SyncResult {
  organizationId: string;
  boards: BoardSyncResult[];
}

export interface SyncFailure {
  organizationId: string;
  error: string;
}

/**
 * Sync every board configured for one org. Updates `last_sync_at` on success
 * and `last_error` on failure; never throws — the cron route inspects the
 * returned value.
 */
export async function syncOrganization(
  supabase: SupabaseClient,
  organizationId: string,
  opts: SyncOptions = {},
): Promise<SyncResult | SyncFailure> {
  const now = (opts.now ?? (() => new Date()))();

  try {
    const { data: integration, error: loadErr } = await supabase
      .from("org_integrations")
      .select("id, credentials_encrypted, status, config")
      .eq("organization_id", organizationId)
      .eq("provider", PROVIDER)
      .maybeSingle();

    if (loadErr) throw new Error(`load integration: ${loadErr.message}`);
    if (!integration) throw new Error("integration row not found");
    if (integration.status === "disconnected") {
      throw new Error("integration is disconnected");
    }
    if (!integration.credentials_encrypted) {
      throw new Error("integration has no credentials (disconnected?)");
    }

    const creds = await decryptCredentials<GitHubProjectsCredentials>(
      integration.credentials_encrypted,
    );
    if (!creds?.token)
      throw new Error("integration credentials carry no token");

    const boards = readBoardConfig(integration.config);
    if (boards.length === 0) {
      throw new Error("integration config lists no boards");
    }

    const repoLookup = await loadRepoLookup(supabase, organizationId);

    const results: BoardSyncResult[] = [];
    for (const board of boards) {
      results.push(
        await syncBoard(
          supabase,
          organizationId,
          creds,
          board,
          repoLookup,
          now,
          opts,
        ),
      );
    }

    await supabase
      .from("org_integrations")
      .update({
        last_sync_at: now.toISOString(),
        last_error: null,
        status: "active",
      })
      .eq("organization_id", organizationId)
      .eq("provider", PROVIDER);

    return { organizationId, boards: results };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("github-projects sync failed", {
      organizationId,
      error: message,
    });
    await supabase
      .from("org_integrations")
      .update({ last_error: truncate(message, 1000), status: "error" })
      .eq("organization_id", organizationId)
      .eq("provider", PROVIDER);
    return { organizationId, error: message };
  }
}

// ---------------------------------------------------------------------------
// Per-board sync
// ---------------------------------------------------------------------------

async function syncBoard(
  supabase: SupabaseClient,
  organizationId: string,
  creds: GitHubProjectsCredentials,
  config: BoardConfig,
  repoLookup: Map<string, string>,
  now: Date,
  opts: SyncOptions,
): Promise<BoardSyncResult> {
  const ref: BoardRef = {
    ownerLogin: config.owner,
    ownerType: config.ownerType ?? "organization",
    number: config.number,
  };

  const raw = await fetchProjectItems(creds, ref);

  const { data: boardRow, error: boardErr } = await supabase
    .from("project_boards")
    .upsert(
      {
        organization_id: organizationId,
        provider_project_id: raw.projectId,
        owner_login: ref.ownerLogin,
        owner_type: ref.ownerType,
        number: ref.number,
        title: raw.title,
        team_slug: config.teamSlug ?? null,
        status_config: config.statusConfig ?? {},
        last_synced_at: now.toISOString(),
      },
      { onConflict: "organization_id,provider_project_id" },
    )
    .select("id")
    .single();

  if (boardErr || !boardRow) {
    throw new Error(`upsert board: ${boardErr?.message ?? "no row returned"}`);
  }
  const boardId = boardRow.id as string;

  // Which items already carry history, and at what updatedAt. Drives the
  // incremental decision below.
  const known = await loadKnownItems(supabase, boardId);

  const itemsUpserted = await upsertItems(
    supabase,
    boardId,
    raw.items,
    repoLookup,
    now,
  );

  const needHistory = raw.items.filter((item) =>
    needsHistoryFetch(item, known, opts.forceFullHistory ?? false),
  );
  const contentIds = needHistory
    .map((i) => i.contentId)
    .filter((id): id is string => id !== null);

  let eventsUpserted = 0;
  if (contentIds.length > 0) {
    const history = await fetchStatusHistory(creds, contentIds, raw.projectId);

    // Events are keyed by content id; rows need our item uuid. The board read
    // is the only place that knows both, so bridge through it.
    const uuidByProviderItemId = await loadItemUuids(supabase, boardId);
    const uuidByContentId = new Map<string, string>();
    for (const item of raw.items) {
      if (!item.contentId) continue;
      const uuid = uuidByProviderItemId.get(item.itemId);
      if (uuid) uuidByContentId.set(item.contentId, uuid);
    }

    eventsUpserted = await upsertEvents(
      supabase,
      history.eventsByContentId,
      uuidByContentId,
    );

    await markHistoryAvailable(
      supabase,
      boardId,
      needHistory,
      history.truncatedContentIds,
    );
  }

  return {
    boardId,
    title: raw.title,
    itemsUpserted,
    eventsUpserted,
    historyFetched: contentIds.length,
    itemsWithoutHistory: raw.items.filter((i) => i.contentId === null).length,
  };
}

interface KnownItem {
  itemUpdatedAt: string | null;
  historyAvailable: boolean;
}

async function loadKnownItems(
  supabase: SupabaseClient,
  boardId: string,
): Promise<Map<string, KnownItem>> {
  const out = new Map<string, KnownItem>();
  // Paginate: a large board would otherwise hit PostgREST's max-rows cap and
  // silently look like "no items known", re-fetching every timeline daily.
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("project_items")
      .select("provider_item_id, item_updated_at, history_available")
      .eq("board_id", boardId)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`load known items: ${error.message}`);
    for (const row of data ?? []) {
      out.set(row.provider_item_id, {
        itemUpdatedAt: row.item_updated_at,
        historyAvailable: row.history_available,
      });
    }
    if (!data || data.length < pageSize) break;
  }
  return out;
}

/**
 * An item needs its timeline read when it is new, when the board item changed
 * since we last saw it, or when a previous run never managed to record history.
 * Drafts are excluded up front — they have no timeline to read.
 */
function needsHistoryFetch(
  item: RawProjectItem,
  known: Map<string, KnownItem>,
  force: boolean,
): boolean {
  if (item.contentId === null) return false;
  if (force) return true;

  const previous = known.get(item.itemId);
  if (!previous) return true;
  if (!previous.historyAvailable) return true;
  if (previous.itemUpdatedAt !== item.itemUpdatedAt) return true;
  return false;
}

async function upsertItems(
  supabase: SupabaseClient,
  boardId: string,
  items: RawProjectItem[],
  repoLookup: Map<string, string>,
  now: Date,
): Promise<number> {
  const rows = dedupeBy(
    items.map((item) => ({
      board_id: boardId,
      provider_item_id: item.itemId,
      content_type: item.contentType,
      content_repo: item.contentRepo,
      content_number: item.contentNumber,
      repository_id: resolveRepositoryId(item.contentRepo, repoLookup),
      title: item.title,
      current_status: item.status,
      content_state: item.contentState,
      source_created_at: item.createdAt,
      source_closed_at: item.closedAt,
      item_updated_at: item.itemUpdatedAt,
      assignees: item.assignees,
      labels: item.labels,
      iteration: item.iteration,
      priority: item.priority,
      size: item.size,
      fetched_at: now.toISOString(),
    })),
    (r) => r.provider_item_id,
  );

  let total = 0;
  for (const chunk of chunked(rows, UPSERT_CHUNK)) {
    const { error, count } = await supabase
      .from("project_items")
      .upsert(chunk, {
        onConflict: "board_id,provider_item_id",
        // history_available is owned by the history step, not by this one.
        ignoreDuplicates: false,
        count: "exact",
      });
    if (error) throw new Error(`upsert items: ${error.message}`);
    total += count ?? chunk.length;
  }
  return total;
}

/** Map `provider_item_id` → `project_items.id` for one board. */
async function loadItemUuids(
  supabase: SupabaseClient,
  boardId: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("project_items")
      .select("id, provider_item_id")
      .eq("board_id", boardId)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`load item ids: ${error.message}`);
    for (const row of data ?? []) out.set(row.provider_item_id, row.id);
    if (!data || data.length < pageSize) break;
  }
  return out;
}

async function upsertEvents(
  supabase: SupabaseClient,
  eventsByContentId: Map<string, RawStatusEvent[]>,
  uuidByContentId: Map<string, string>,
): Promise<number> {
  const rows: Array<Record<string, unknown>> = [];
  for (const [contentId, events] of eventsByContentId) {
    const itemId = uuidByContentId.get(contentId);
    if (!itemId) continue;
    for (const e of events) {
      rows.push({
        item_id: itemId,
        event_kind: e.kind,
        previous_status: e.previousStatus,
        status: e.status,
        occurred_at: e.occurredAt,
        was_automated: e.wasAutomated,
        actor_login: e.actorLogin,
        provider_event_id: e.eventId,
      });
    }
  }

  const deduped = dedupeBy(rows, (r) => r.provider_event_id as string);

  let total = 0;
  for (const chunk of chunked(deduped, UPSERT_CHUNK)) {
    const { error, count } = await supabase
      .from("project_status_events")
      .upsert(chunk, { onConflict: "provider_event_id", count: "exact" });
    if (error) throw new Error(`upsert status events: ${error.message}`);
    total += count ?? chunk.length;
  }
  return total;
}

async function markHistoryAvailable(
  supabase: SupabaseClient,
  boardId: string,
  fetched: RawProjectItem[],
  truncatedContentIds: Set<string>,
): Promise<void> {
  const truncated = fetched
    .filter((i) => i.contentId && truncatedContentIds.has(i.contentId))
    .map((i) => i.itemId);
  const complete = fetched
    .filter((i) => !i.contentId || !truncatedContentIds.has(i.contentId))
    .map((i) => i.itemId);

  for (const [ids, isTruncated] of [
    [complete, false],
    [truncated, true],
  ] as const) {
    for (const chunk of chunked(ids, UPSERT_CHUNK)) {
      if (chunk.length === 0) continue;
      const { error } = await supabase
        .from("project_items")
        .update({ history_available: true, history_truncated: isTruncated })
        .eq("board_id", boardId)
        .in("provider_item_id", chunk);
      if (error) throw new Error(`mark history: ${error.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function readBoardConfig(config: unknown): BoardConfig[] {
  if (!config || typeof config !== "object") return [];
  const boards = (config as { boards?: unknown }).boards;
  if (!Array.isArray(boards)) return [];

  const out: BoardConfig[] = [];
  for (const entry of boards) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const owner = typeof e.owner === "string" ? e.owner : null;
    const number = typeof e.number === "number" ? e.number : null;
    if (!owner || number === null) continue;

    out.push({
      owner,
      number,
      ownerType: e.ownerType === "user" ? "user" : "organization",
      teamSlug: typeof e.teamSlug === "string" ? e.teamSlug : undefined,
      statusConfig:
        e.statusConfig && typeof e.statusConfig === "object"
          ? (e.statusConfig as Record<string, string[]>)
          : undefined,
    });
  }
  return out;
}

/**
 * Map bare repo name → repositories.id. Board content carries
 * "owner/repo" while Iris stores the bare name, so both sides are
 * normalized to the bare, lowercased name.
 */
async function loadRepoLookup(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("repositories")
      .select("id, name")
      .eq("organization_id", organizationId)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`load repositories: ${error.message}`);
    for (const row of data ?? []) {
      out.set(bareName(row.name), row.id);
    }
    if (!data || data.length < pageSize) break;
  }
  return out;
}

function resolveRepositoryId(
  contentRepo: string | null,
  lookup: Map<string, string>,
): string | null {
  if (!contentRepo) return null;
  return lookup.get(bareName(contentRepo)) ?? null;
}

function bareName(repo: string): string {
  const parts = repo.split("/");
  return (parts[parts.length - 1] ?? repo).trim().toLowerCase();
}

/**
 * Postgres rejects an upsert whose rows repeat the conflict key, so dedupe
 * before sending. Last occurrence wins.
 */
function dedupeBy<T>(rows: T[], key: (row: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) byKey.set(key(row), row);
  return [...byKey.values()];
}

function chunked<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
