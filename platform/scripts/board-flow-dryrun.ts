/**
 * Dry-run the GitHub Projects board flow analysis against a live board.
 *
 * Reads the board through the real client, runs the real quality gates and the
 * real metrics, and prints the result. Touches no database — which is the point:
 * it validates the API queries, the column classification and the honesty rules
 * against a real board before anyone applies a migration or wires a dashboard.
 *
 * Usage:
 *   npx tsx scripts/board-flow-dryrun.ts <owner> <projectNumber> [--user]
 *
 * Token: $GITHUB_TOKEN, or falls back to `gh auth token`. Needs `read:project`
 * (plus `repo` to read private repository content).
 */

import { execFileSync } from "node:child_process";

import {
  fetchProjectItems,
  fetchStatusHistory,
  type RawProjectItem,
  type RawStatusEvent,
} from "../lib/integrations/github-projects/client";
import { classifyStatuses, summarizeBoard } from "../lib/queries/board-flow";
import { evaluateQuality } from "../lib/queries/board-quality";
import type { BoardItemInput, StatusEventInput } from "../src/types/board-flow";

function resolveToken(): string {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error(
      "No token: set GITHUB_TOKEN or authenticate the GitHub CLI (`gh auth login`).",
    );
  }
}

/**
 * Map the client's raw shapes onto the metric inputs.
 *
 * In production this translation happens on the read side (the metrics read
 * persisted rows, not the client), so it lives here rather than in the library.
 */
function toItemInput(
  raw: RawProjectItem,
  historyAvailable: boolean,
): BoardItemInput {
  return {
    id: raw.itemId,
    title: raw.title,
    contentType: raw.contentType,
    currentStatus: raw.status,
    contentState: raw.contentState,
    sourceCreatedAt: raw.createdAt,
    sourceClosedAt: raw.closedAt,
    itemUpdatedAt: raw.itemUpdatedAt,
    assignees: raw.assignees,
    labels: raw.labels,
    iteration: raw.iteration,
    priority: raw.priority,
    size: raw.size,
    historyAvailable,
  };
}

function toEventInputs(
  itemId: string,
  events: RawStatusEvent[],
): StatusEventInput[] {
  return events.map((e) => ({
    itemId,
    kind: e.kind,
    previousStatus: e.previousStatus,
    status: e.status,
    occurredAt: e.occurredAt,
    wasAutomated: e.wasAutomated,
  }));
}

function days(hours: number | null): string {
  return hours === null ? "—" : `${(hours / 24).toFixed(2)}d`;
}

async function main() {
  const [owner, numberArg, ...flags] = process.argv.slice(2);
  if (!owner || !numberArg) {
    console.error(
      "Usage: npx tsx scripts/board-flow-dryrun.ts <owner> <projectNumber> [--user]",
    );
    process.exit(1);
  }

  const board = {
    ownerLogin: owner,
    ownerType: flags.includes("--user")
      ? ("user" as const)
      : ("organization" as const),
    number: Number(numberArg),
  };
  const creds = { token: resolveToken() };

  const startedAt = Date.now();
  console.log(`\nReading ${owner}/${board.number} ...`);

  const raw = await fetchProjectItems(creds, board);
  const itemPages = Math.ceil(raw.items.length / 50);
  console.log(
    `  ${raw.items.length} items on "${raw.title}" (~${itemPages} page(s))`,
  );

  const withContent = raw.items.filter((i) => i.contentId !== null);
  const drafts = raw.items.length - withContent.length;

  const history = await fetchStatusHistory(
    creds,
    withContent.map((i) => i.contentId!),
    raw.projectId,
  );
  const historyBatches = Math.ceil(withContent.length / 20);
  const totalEvents = [...history.eventsByContentId.values()].reduce(
    (sum, e) => sum + e.length,
    0,
  );
  console.log(
    `  ${totalEvents} status events across ${history.eventsByContentId.size} items ` +
      `(~${historyBatches} batch(es)); ${drafts} draft(s) without history`,
  );
  console.log(
    `  ~${itemPages + historyBatches} GraphQL requests, ${((Date.now() - startedAt) / 1000).toFixed(1)}s\n`,
  );

  // Build metric inputs. An item has history when the fetch returned events for
  // its content id; drafts never do.
  const items: BoardItemInput[] = [];
  const events: StatusEventInput[] = [];
  for (const rawItem of raw.items) {
    const itemEvents = rawItem.contentId
      ? (history.eventsByContentId.get(rawItem.contentId) ?? [])
      : [];
    items.push(toItemInput(rawItem, itemEvents.length > 0));
    events.push(...toEventInputs(rawItem.itemId, itemEvents));
  }

  const seen = new Set<string>();
  for (const i of items) if (i.currentStatus) seen.add(i.currentStatus);
  for (const e of events) {
    if (e.status) seen.add(e.status);
    if (e.previousStatus) seen.add(e.previousStatus);
  }
  const classification = classifyStatuses({}, seen);

  console.log("COLUMN CLASSIFICATION (no config — pure heuristics)");
  for (const [status, bucket] of [...classification.byStatus].sort()) {
    console.log(`  ${bucket.padEnd(10)} ${status}`);
  }
  if (classification.unmapped.length > 0) {
    console.log(`  UNMAPPED: ${classification.unmapped.join(", ")}`);
  }

  const quality = evaluateQuality(items, events, classification);
  console.log(`\nQUALITY GATES — overall: ${quality.overall.toUpperCase()}`);
  for (const gate of quality.gates) {
    const mark =
      gate.severity === "ok"
        ? "ok  "
        : gate.severity === "warning"
          ? "WARN"
          : "CRIT";
    console.log(
      `  [${mark}] ${gate.id} = ${gate.value}${gate.unit === "percent" ? "%" : ""}`,
    );
    console.log(`         ${gate.summary}`);
  }

  const summary = summarizeBoard(items, events, {
    boardId: raw.projectId,
    title: raw.title,
    now: new Date(),
  });

  console.log(`\nCOVERAGE`);
  console.log(
    `  ${summary.coverage.itemsWithHistory}/${summary.coverage.totalItems} items with history ` +
      `(${summary.coverage.historyCoveragePct}%), ${summary.coverage.itemsApproximated} approximated`,
  );

  console.log(`\nLEAD TIME (n=${summary.leadTime.n})`);
  console.log(
    `  p50 ${days(summary.leadTime.p50)}  p70 ${days(summary.leadTime.p70)}  ` +
      `p85 ${days(summary.leadTime.p85)}  p95 ${days(summary.leadTime.p95)}` +
      (summary.leadTime.suppressed.length
        ? `   [suppressed: ${summary.leadTime.suppressed.join(", ")}]`
        : ""),
  );
  console.log(`CYCLE TIME (n=${summary.cycleTime.n})`);
  console.log(
    `  p50 ${days(summary.cycleTime.p50)}  p85 ${days(summary.cycleTime.p85)}`,
  );
  console.log(
    `FLOW EFFICIENCY  ${summary.flowEfficiencyMedian === null ? "—" : `${(summary.flowEfficiencyMedian * 100).toFixed(1)}%`}`,
  );

  console.log(`\nTIME PER COLUMN (median, n)`);
  for (const phase of summary.phases) {
    console.log(
      `  ${(phase.bucket ?? "?").padEnd(10)} ${phase.status.padEnd(24)} ` +
        `${days(phase.medianHours).padStart(8)}  n=${phase.n}` +
        (phase.reentered > 0 ? `  (${phase.reentered} re-entered)` : ""),
    );
  }

  console.log(`\nWIP ${summary.wip} — aging by column`);
  for (const col of summary.aging) {
    console.log(
      `  ${col.status.padEnd(24)} count=${String(col.count).padStart(3)}  ` +
        `median ${days(col.medianAgeHours).padStart(8)}  max ${days(col.maxAgeHours).padStart(8)}`,
    );
  }

  console.log(
    `\nSTALLED (no move in 7+ days) — ${summary.stalled.length} item(s)`,
  );
  for (const item of summary.stalled.slice(0, 10)) {
    console.log(
      `  ${days(item.hoursSinceLastMove).padStart(8)} in ${(item.currentStatus ?? "?").padEnd(22)} ` +
        `age ${days(item.totalAgeHours).padStart(8)}  ${item.title.slice(0, 46)}`,
    );
  }

  console.log(`\nTHROUGHPUT (per ISO week)`);
  for (const week of summary.throughput.slice(-8)) {
    console.log(
      `  ${week.week}  ${"#".repeat(Math.min(week.count, 40))} ${week.count}`,
    );
  }

  console.log(`\nFLOW BALANCE (last 8 weeks)`);
  for (const week of summary.balance.slice(-8)) {
    console.log(
      `  ${week.week}  in ${String(week.inflow).padStart(3)}  out ${String(week.outflow).padStart(3)}  ` +
        `cumulative ${week.cumulativeDelta > 0 ? "+" : ""}${week.cumulativeDelta}`,
    );
  }

  const ll = summary.littlesLaw;
  console.log(`\nLITTLE'S LAW`);
  console.log(
    `  wip=${ll.wip}  throughput=${ll.throughputPerWeek}/week  ` +
      `predicted ${days(ll.predictedLeadTimeHours)}  observed ${days(ll.observedLeadTimeHours)}  ` +
      `divergence ${ll.divergenceRatio ?? "—"}`,
  );

  console.log(`\nCFD — ${summary.cfd.length} weekly points`);
  const last = summary.cfd[summary.cfd.length - 1];
  if (last) {
    console.log(`  latest (${last.week}): ${JSON.stringify(last.counts)}`);
  }
  console.log();
}

main().catch((err) => {
  console.error(
    `\nFAILED: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
