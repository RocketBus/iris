-- 023_github_projects.sql
-- Board-level flow analysis from GitHub Projects V2.
--
-- Why there is no snapshot table here
-- -----------------------------------
-- The obvious design for "how long did each card sit in each column" is a
-- periodic snapshot of the board plus a diffing job. That design is wrong for
-- Projects V2: the GraphQL API exposes `ProjectV2ItemStatusChangedEvent` on the
-- issue timeline, carrying `createdAt`, `previousStatus`, `status` and
-- `wasAutomated`. The full transition history is therefore readable
-- retroactively, at second precision, on the first sync — no accumulation
-- period, no +/-24h detection window, and no blind spot for two transitions
-- inside one collection interval.
--
-- So we persist the *events* the API already knows about, and derive phase
-- durations with window functions over `occurred_at`. Re-entry into a column
-- is a separate row, which is what makes accumulated per-phase time correct
-- instead of last-write-wins.
--
-- The one thing this cannot cover: `DraftIssue` has no `timelineItems` field at
-- all (it is not an Issue), so drafts carry current status but no history.
-- `project_items.history_available` marks them, and duration metrics exclude
-- them rather than guessing.

ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'github_projects';

-- ---------------------------------------------------------------------------
-- Boards
-- ---------------------------------------------------------------------------

CREATE TABLE project_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- GitHub's global node id for the project, e.g. "PVT_kwDOA...".
  provider_project_id TEXT NOT NULL,
  -- Owner login + the human-facing project number, as used in the URL.
  owner_login TEXT NOT NULL,
  owner_type TEXT NOT NULL DEFAULT 'organization'
    CHECK (owner_type IN ('organization', 'user')),
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  -- Optional grouping label. Iris has no team entity of its own; a board maps
  -- to whatever unit the adopter organizes by (team, squad, tribe, product).
  -- Analysis groups by this string and never interprets it.
  team_slug TEXT,
  -- Maps this board's column names onto the four lifecycle buckets:
  --   {"backlog": [...], "discovery": [...], "active": [...], "done": [...]}
  -- Empty means "classify by the built-in name heuristics". Column names are
  -- free text per board, so any hardcoded vocabulary would be wrong for
  -- somebody; unmatched columns are reported, never silently dropped.
  status_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider_project_id)
);

CREATE INDEX idx_project_boards_org ON project_boards(organization_id);
CREATE INDEX idx_project_boards_team
  ON project_boards(organization_id, team_slug)
  WHERE team_slug IS NOT NULL;

CREATE TRIGGER update_project_boards_updated_at BEFORE UPDATE ON project_boards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Items
-- ---------------------------------------------------------------------------

CREATE TABLE project_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES project_boards(id) ON DELETE CASCADE,
  -- GitHub's global node id for the board item ("PVTI_..."). Idempotency key.
  provider_item_id TEXT NOT NULL,
  content_type TEXT NOT NULL
    CHECK (content_type IN ('ISSUE', 'PULL_REQUEST', 'DRAFT_ISSUE')),
  -- NULL for DRAFT_ISSUE: a draft lives only on the board, so it has no
  -- repository and no number. Code reading these must not assume an issue.
  content_repo TEXT,
  content_number INTEGER,
  -- Best-effort link to a tracked Iris repo, when content_repo resolves.
  repository_id UUID REFERENCES repositories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  -- Current Status field value. NULL when the board has no Status field or
  -- the item was never assigned one.
  current_status TEXT,
  -- OPEN | CLOSED | MERGED for issues/PRs; NULL for drafts.
  content_state TEXT,
  source_created_at TIMESTAMPTZ,
  source_closed_at TIMESTAMPTZ,
  -- The board item's own updatedAt. Drives incremental re-sync: an item whose
  -- updatedAt has not moved cannot have new transitions.
  item_updated_at TIMESTAMPTZ,
  assignees TEXT[] NOT NULL DEFAULT '{}',
  labels TEXT[] NOT NULL DEFAULT '{}',
  iteration TEXT,
  priority TEXT,
  size TEXT,
  -- FALSE for drafts (no timeline) and for items whose history fetch failed.
  -- Duration metrics must filter on this instead of treating absence as zero.
  history_available BOOLEAN NOT NULL DEFAULT FALSE,
  -- TRUE when the timeline had more status events than we paginated through.
  history_truncated BOOLEAN NOT NULL DEFAULT FALSE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (board_id, provider_item_id)
);

CREATE INDEX idx_project_items_board ON project_items(board_id);
CREATE INDEX idx_project_items_board_status
  ON project_items(board_id, current_status);
CREATE INDEX idx_project_items_repo
  ON project_items(repository_id)
  WHERE repository_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Status events
-- ---------------------------------------------------------------------------

CREATE TABLE project_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES project_items(id) ON DELETE CASCADE,
  -- ADDED: item entered the board (AddedToProjectV2Event).
  -- STATUS_CHANGED: column move (ProjectV2ItemStatusChangedEvent).
  -- REMOVED: taken off the board (RemovedFromProjectV2Event) — an exit, and
  --   explicitly NOT a completion. Throughput must not count it.
  event_kind TEXT NOT NULL
    CHECK (event_kind IN ('ADDED', 'STATUS_CHANGED', 'REMOVED')),
  -- Empty string when GitHub reports the item had no prior status (first
  -- assignment). Kept verbatim rather than normalized to NULL so the
  -- distinction between "no previous column" and "unknown" survives.
  previous_status TEXT,
  status TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  -- GitHub's own flag for automation-driven moves (workflow rules, auto-add).
  -- A better signal than guessing from identical timestamps.
  was_automated BOOLEAN NOT NULL DEFAULT FALSE,
  actor_login TEXT,
  -- Global node id of the timeline event. Idempotency key: re-syncing the
  -- same timeline re-upserts the same rows instead of duplicating history.
  provider_event_id TEXT NOT NULL UNIQUE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phase derivation always reads one item's events in chronological order.
CREATE INDEX idx_project_status_events_item_time
  ON project_status_events(item_id, occurred_at);
