/**
 * Read side for board flow analysis.
 *
 * Loads persisted board items and status events, then hands them to the pure
 * functions in `board-flow.ts` / `board-quality.ts`. The split matters: every
 * calculation stays unit-testable without a database, and this file only does
 * I/O and shape translation.
 *
 * Reads paginate explicitly. PostgREST caps every response at the project's
 * "Max rows" (default 1000), and a board with more items than that would come
 * back silently truncated — the same failure mode that produced the "repos with
 * metrics show 0 runs" bug (#121).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { classifyStatuses, summarizeBoard } from "./board-flow";
import { evaluateQuality } from "./board-quality";

import type {
  BoardFlowSummary,
  BoardItemInput,
  QualityReport,
  StatusConfig,
  StatusEventInput,
} from "@/types/board-flow";

const PAGE_SIZE = 1000;

export interface BoardRow {
  id: string;
  title: string;
  ownerLogin: string;
  number: number;
  teamSlug: string | null;
  statusConfig: StatusConfig;
  lastSyncedAt: string | null;
}

export interface BoardFlowResult {
  board: BoardRow;
  summary: BoardFlowSummary;
  quality: QualityReport;
}

/**
 * Postgres error codes meaning "the tables aren't there yet" — migration 023
 * not applied. Callers render an unconfigured state instead of an error page,
 * so the nav entry never 500s on a deployment that hasn't migrated.
 */
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

function isMissingTable(error: { code?: string } | null): boolean {
  return !!error?.code && MISSING_TABLE_CODES.has(error.code);
}

/**
 * Boards configured for an org, newest sync first. Returns `null` when the
 * schema is absent (integration never deployed), `[]` when it exists but the
 * org has no boards.
 */
export async function getOrgBoards(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<BoardRow[] | null> {
  const { data, error } = await supabase
    .from("project_boards")
    .select(
      "id, title, owner_login, number, team_slug, status_config, last_synced_at",
    )
    .eq("organization_id", organizationId)
    .order("title");

  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(`load boards: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    ownerLogin: row.owner_login,
    number: row.number,
    teamSlug: row.team_slug,
    statusConfig: (row.status_config ?? {}) as StatusConfig,
    lastSyncedAt: row.last_synced_at,
  }));
}

/** Full flow analysis for one board. */
export async function getBoardFlow(
  supabase: SupabaseClient,
  board: BoardRow,
  now?: Date,
): Promise<BoardFlowResult> {
  const items = await loadItems(supabase, board.id);
  const events = await loadEvents(
    supabase,
    items.map((i) => i.id),
  );

  const classificationInput = new Set<string>();
  for (const item of items) {
    if (item.currentStatus) classificationInput.add(item.currentStatus);
  }
  for (const event of events) {
    if (event.status) classificationInput.add(event.status);
    if (event.previousStatus) classificationInput.add(event.previousStatus);
  }

  const summary = summarizeBoard(items, events, {
    boardId: board.id,
    title: board.title,
    teamSlug: board.teamSlug,
    statusConfig: board.statusConfig,
    now,
  });

  // The gates need the same column classification the summary used, so both
  // sides agree on which column is terminal.
  const classification = classifyStatuses(
    board.statusConfig,
    classificationInput,
  );
  const quality = evaluateQuality(items, events, classification);

  return { board, summary, quality };
}

async function loadItems(
  supabase: SupabaseClient,
  boardId: string,
): Promise<BoardItemInput[]> {
  const out: BoardItemInput[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("project_items")
      .select(
        "id, title, content_type, current_status, content_state, source_created_at, source_closed_at, item_updated_at, assignees, labels, iteration, priority, size, history_available",
      )
      .eq("board_id", boardId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`load board items: ${error.message}`);

    for (const row of data ?? []) {
      out.push({
        id: row.id,
        title: row.title,
        contentType: row.content_type,
        currentStatus: row.current_status,
        contentState: row.content_state,
        sourceCreatedAt: row.source_created_at,
        sourceClosedAt: row.source_closed_at,
        itemUpdatedAt: row.item_updated_at,
        assignees: row.assignees ?? [],
        labels: row.labels ?? [],
        iteration: row.iteration,
        priority: row.priority,
        size: row.size,
        historyAvailable: row.history_available,
      });
    }

    if (!data || data.length < PAGE_SIZE) break;
  }

  return out;
}

/**
 * Status events for the given items.
 *
 * Item ids are chunked into the `.in()` filter so the URL stays within limits
 * on a large board, and each chunk paginates independently — one item can carry
 * dozens of transitions, so row count is not bounded by item count.
 */
async function loadEvents(
  supabase: SupabaseClient,
  itemIds: string[],
): Promise<StatusEventInput[]> {
  if (itemIds.length === 0) return [];

  const ID_CHUNK = 200;
  const out: StatusEventInput[] = [];

  for (let i = 0; i < itemIds.length; i += ID_CHUNK) {
    const chunk = itemIds.slice(i, i + ID_CHUNK);

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("project_status_events")
        .select(
          "item_id, event_kind, previous_status, status, occurred_at, was_automated",
        )
        .in("item_id", chunk)
        .order("occurred_at")
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(`load status events: ${error.message}`);

      for (const row of data ?? []) {
        out.push({
          itemId: row.item_id,
          kind: row.event_kind,
          previousStatus: row.previous_status,
          status: row.status,
          occurredAt: row.occurred_at,
          wasAutomated: row.was_automated,
        });
      }

      if (!data || data.length < PAGE_SIZE) break;
    }
  }

  return out;
}
