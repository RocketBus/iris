# GitHub Projects Integration

Iris reads a GitHub Projects V2 board to measure delivery flow: lead time,
time in each column, throughput, WIP aging and bottlenecks.

It exists because the engine deliberately measures a narrow window. Cycle time
in `flow_efficiency.py` runs from PR open to merge and says nothing about the
queue in front of it. If AI shortens the coding phase but total lead time does
not move, the constraint sits outside the code — and only board data can show
that.

This page covers what is read, what is computed, and what the data cannot
support.

---

## The API fact that shapes everything

The intuitive design for "how long did each card sit in each column" is a
periodic snapshot of the board plus a diffing job. For Projects V2 that design
is unnecessary.

The GraphQL API exposes `ProjectV2ItemStatusChangedEvent` on the timeline of
the item's issue or pull request:

```graphql
... on ProjectV2ItemStatusChangedEvent {
  createdAt        # when
  previousStatus   # from
  status           # to
  wasAutomated     # automation vs. human
  project { id }   # which board
}
```

Alongside it, `AddedToProjectV2Event` and `RemovedFromProjectV2Event` mark board
entry and exit.

Consequences:

- **History is retroactive.** The first sync backfills a board's full past. No
  accumulation period before the first number is available.
- **Precision is exact**, to the second — not bounded by a collection interval.
- **Cumulative flow diagrams are reconstructable** for any past week.
- `wasAutomated` distinguishes workflow automation from a person moving a card,
  which is a better bulk-movement signal than inferring it from timestamps.

Verify it yourself on any issue that has moved columns:

```bash
gh api graphql -f query='
query {
  repository(owner:"OWNER", name:"REPO") {
    issue(number: NUM) {
      timelineItems(first:100, itemTypes:[PROJECT_V2_ITEM_STATUS_CHANGED_EVENT]) {
        nodes {
          ... on ProjectV2ItemStatusChangedEvent {
            createdAt previousStatus status wasAutomated
          }
        }
      }
    }
  }
}'
```

### The one gap: draft items

`DraftIssue` is not an Issue and has no `timelineItems` field, so drafts carry
current status but no history. They are marked `history_available = false` and
excluded from every duration metric — never counted as zero. The
`history_coverage` gate reports how much of the board that leaves out.

---

## Setup

### 1. Token

A token with `read:project` on the board's owner (plus `repo` to read private
repository content). Stored encrypted at rest with `pgp_sym_encrypt`, keyed by
the deployment's `INTEGRATIONS_ENCRYPTION_KEY`, exactly like the Datadog
credentials.

### 2. Configure the boards

One `org_integrations` row with `provider = 'github_projects'`, whose `config`
lists the boards to sync:

```json
{
  "boards": [
    {
      "owner": "acme-inc",
      "ownerType": "organization",
      "number": 42,
      "teamSlug": "platform",
      "statusConfig": {
        "backlog":   ["Backlog", "Icebox"],
        "discovery": ["Discovery", "Refinement"],
        "queue":     ["Ready for Development", "Ready for Deploy"],
        "active":    ["In Progress", "Code Review", "Validation"],
        "done":      ["Done", "Cancelled"]
      }
    }
  ]
}
```

- `number` is the project number from its URL.
- `teamSlug` is a free-form grouping label. Iris has no team entity of its own
  and never interprets this string — it groups by it.
- `statusConfig` is optional. When absent, columns are classified by generic
  name heuristics (see below). A malformed board entry is skipped, not fatal.

### 3. Sync

The existing daily cron (`/api/cron/sync-integrations`, 04:00 UTC) picks the
provider up automatically. The first run backfills; later runs only re-read the
timeline of items whose board `updatedAt` moved, so the daily cost tracks board
activity rather than board size.

---

## Column classification

Column names are free text on every board, so nothing is hardcoded to a
particular workflow. Each column maps to a lifecycle bucket, from explicit
`statusConfig` first and generic name patterns second:

| Bucket | Meaning | Matched by (when unconfigured) |
|---|---|---|
| `backlog` | Not started | backlog, icebox, inbox, triage, todo, new |
| `discovery` | Being defined | discovery, refinement, grooming, spec, design, analysis |
| `queue` | Waiting, not being worked | ready, awaiting, waiting, blocked, pending, hold |
| `active` | Work in progress | progress, doing, dev, review, test, qa, validation, deploy, monitoring |
| `done` | Terminal | done, closed, complete, shipped, delivered, cancelled |

Patterns cover English and Portuguese vocabularies. Anything unmatched is
reported in `unmappedStatuses` rather than silently treated as not-done — a
column quietly assumed non-terminal distorts lead time for every item ending
there.

**Why `queue` exists beyond the obvious four.** Boards routinely have columns
that are neither backlog nor work in flight ("Ready for Deploy", "Blocked").
Counting them as `active` inflates flow efficiency, whose whole purpose is
exposing invisible waiting; counting them as `backlog` corrupts backlog growth.
They get their own bucket: waiting, but not backlog.

---

## Quality gates

Gates run **before** any metric is trusted, and they are not a footnote. On a
real board, un-gated data produced a median lead time of a fraction of a day —
flattering and false, caused by a batch of setup cards created and closed
minutes apart.

| Gate | Detects | Why it matters |
|---|---|---|
| `synthetic_items` | Placeholder titles (`dummy`, `asdf`, `lorem`); ambiguous ones only with a short lifetime | Scaffolding lands in the fast tail and collapses the median |
| `mass_import` | Same-minute creation batches also closed within minutes | Board import/backfill, not flow: near-zero lead time and a fake throughput spike |
| `done_not_closed` | Terminal column with an open issue | Makes `closedAt` unusable as the lead-time fallback |
| `bulk_movement` | 5+ items moved within 2 minutes; GitHub's `wasAutomated` | Records board maintenance, not flow |
| `field_completeness` | Fill rate of priority / size / iteration / assignee | Decides which cuts are trustworthy |
| `assignee_concentration` | Share held by the most-assigned account | Board may be a personal list, not group work |
| `history_coverage` | Share of items with real history | The honest ceiling on duration analysis |

### Two lessons from running this on a live board

**Testing is real work.** An earlier `synthetic_items` matched `test`/`teste` on
their own. On a 198-item board it flagged three genuine items ("Permitir teste
de cenários de rebooking") and caught zero placeholders. Ambiguous words now
require a short lifetime to corroborate; only unambiguous markers fire alone.

**Import is not scaffolding.** 91 of those 198 items were created in
same-minute batches and closed minutes later — all real work, imported when the
board was set up. Same distortion, different remedy: you delete a placeholder,
you exclude an import from duration analysis. Hence two separate gates.

Each gate returns a severity, the measured value, the affected items and a
plain statement of the impact on the reading. Metrics are still computed when a
gate fires — they are just never shown without the caveat.

A note on `assignee_concentration`: it describes the **board**, never a person.
No login is returned, only the share. Iris does not rank or score individuals
(see `docs/PRINCIPLES.md`), and nothing per-person is derived from it.

---

## Metrics

Computed by `platform/lib/queries/board-flow.ts` — pure functions, no I/O.

| Metric | Definition |
|---|---|
| Lead time | Board entry → first arrival in a terminal column |
| Cycle time | First entry into an `active` column → terminal |
| Time per phase | Sum of intervals per column, accumulating re-entries, with per-column `n` |
| Flow efficiency | Active time ÷ lead time |
| Throughput | Items reaching terminal, per ISO week |
| Inflow / outflow | Arrivals vs. departures per week, plus the cumulative delta |
| WIP, aging WIP | Non-terminal items; age per column, median and max |
| Little's Law | WIP ÷ throughput, reported *beside* observed lead time |
| CFD | Item count per column at the end of each week |
| Percentiles | P50 / P70 / P85 / P95, with a sample guard |

### Where it surfaces

`/[tenant]/flow`, reachable from the sidebar as **Delivery Flow**. Section order
is deliberate — quality gates first, so the reader knows what the figures can
carry before reading them; then durations, time per column, WIP aging,
throughput, the CFD, stalled items, and the Little's Law check.

Two presentation notes worth keeping if the page is reworked:

- The CFD groups by **lifecycle bucket**, not by column. A real board carries a
  dozen-plus columns and stacking that many bands is unreadable; five buckets
  make accumulation obvious.
- The product's categorical ramp passes colour-vision separation but sits below
  3:1 against the page surface, so every mark is paired with a visible label or
  rendered as a table. Identity is never carried by colour alone.

### Honesty rules

- **Fallback ladder for lead time.** Transitions (exact) → `closedAt` →
  `item.updatedAt`. Anything past the first rung sets `leadTimeSource`, and the
  item is marked `approximate`. `updatedAt` is only used for items the board
  already considers finished; for open work it would invent a lead time.
- **Sample guards.** Below 20 observations P95 is withheld; below 10, only the
  median plus the raw distribution. `suppressed` names what was withheld.
- **Re-entry accumulates.** A card going back a column produces a second visit;
  per-column time sums both passes.
- **Removal is not completion.** `RemovedFromProjectV2Event` closes the current
  visit and marks the item off-board. Throughput never counts it.
- **Little's Law is a check, not a headline.** Predicted and observed lead time
  are returned together; a large divergence usually means phantom WIP or a
  mis-mapped terminal column.
- **Renamed columns are one column.** Per-phase stats key on the normalized
  name, because renaming leaves the old spelling on historical events —
  otherwise "Ready for Deploy" and "Ready for deploy" split into two rows with a
  misleadingly small `n` each. The most frequent spelling becomes the label.
  Genuinely different names for the same stage ("Ready for dev" vs "Ready for
  Development") stay separate; merging those needs explicit `statusConfig`,
  since guessing would be wrong elsewhere.
- **The terminal column is excluded from time-per-phase.** An item sits in Done
  until archived, so time there measures age since delivery, not flow.

---

## Validating before you trust it

`platform/scripts/board-flow-dryrun.ts` reads a real board through the real
client, runs the real gates and metrics, and prints the result — touching no
database. Use it to check the column classification and the gates against a
board before applying the migration or reading a dashboard.

```bash
npx tsx scripts/board-flow-dryrun.ts <owner> <projectNumber> [--user]
```

Token comes from `$GITHUB_TOKEN` or `gh auth token`. On a 198-item board with
754 status events it made ~14 GraphQL requests in about 17 seconds, which is
also the honest way to size the daily sync cost for a given board.

---

## Not in scope

- **No writes.** Read-only; Iris never moves a card or edits a field.
- **No reconstruction before the first event.** If the API has no history for
  an item, the answer is "not measurable", never a heuristic estimate.
- **No individual ranking.** Permanent, per Principle #2.
- **Only the Status field has history.** Other fields (priority, size,
  iteration) are captured as current values; the API exposes no comparable
  change event for them.
