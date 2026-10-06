import { Effect } from "effect";

import { claimCaseExportEffect } from "@watchdog/core/worker";
import type { ActivityEntry, ActivityEntryKind } from "@watchdog/schemas/feed";
import { type CaseId, parseTrimmedCaseId } from "@watchdog/schemas/shared";

/** Trim and validate a case id for export scheduling; null when not schedulable. */
export function normalizeSchedulableCaseId(caseId: string): CaseId | null {
  return parseTrimmedCaseId(caseId);
}

export function hasSchedulableCaseId(caseId: string): boolean {
  return normalizeSchedulableCaseId(caseId) !== null;
}

/**
 * The Graph kinds: any change to one is a change to the exported Case
 * (ADR-0005 decision 4). Evidence is exported too (its files are part of the
 * shadow workspace), see `shouldTriggerCaseExport`.
 */
const GRAPH_KINDS: ReadonlySet<ActivityEntryKind> = new Set([
  "entity",
  "edge",
  "claim",
  "identifier",
  "event",
  "question",
]);

/**
 * Whether an activity entry changes what a Case export contains.
 *
 * - Exports: a Job that `succeeded` (its Evidence and artifacts landed), any
 *   `evidence` entry, any Graph kind.
 * - Does not: `task` (not exported), `proposal` (export is graph-only; a
 *   Proposal lands in Triage until Accept writes the Graph, which is its own
 *   entries), the other Job actions, and `case` (Case update schedules its own
 *   export directly, and a rename must not re-export twice).
 *
 * An unlisted kind exports nothing: a new kind opts in here.
 */
export function shouldTriggerCaseExport(entry: ActivityEntry): boolean {
  if (entry.kind === "job") return entry.action === "succeeded";
  if (entry.kind === "evidence") return true;
  return GRAPH_KINDS.has(entry.kind);
}

/**
 * First stage of an export entry: marks the case dirty and starts-or-joins the
 * write fiber, returning the Effect that waits for the write. The consumer
 * runs this in its own fiber and forks only the wait, so a shutdown cannot
 * drop the mark (see `handleExportEntryEffect`).
 */
export function claimExportEntryEffect(
  entry: ActivityEntry
): Effect.Effect<Effect.Effect<void>> {
  if (!shouldTriggerCaseExport(entry)) {
    return Effect.succeed(Effect.void);
  }
  const caseId = normalizeSchedulableCaseId(entry.caseId);
  if (caseId === null) {
    return Effect.succeed(Effect.void);
  }
  return claimCaseExportEffect(caseId);
}
