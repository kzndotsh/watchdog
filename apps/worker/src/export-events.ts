import { Effect } from "effect";

import { claimCaseExportEffect, type Db } from "@watchdog/core/worker";
import type { WatchdogEvent } from "@watchdog/schemas/feed";
import { parseTrimmedCaseId } from "@watchdog/schemas/shared";

/** Trim and validate a case id for export scheduling; null when not schedulable. */
export function normalizeSchedulableCaseId(caseId: string): string | null {
  return parseTrimmedCaseId(caseId);
}

export function hasSchedulableCaseId(caseId: string): boolean {
  return normalizeSchedulableCaseId(caseId) !== null;
}

export function shouldTriggerCaseExport(event: WatchdogEvent): boolean {
  switch (event.type) {
    case "job_update": {
      return event.status === "succeeded";
    }
    case "entity_changed":
    case "evidence_changed": {
      return true;
    }
    case "proposal_created": {
      // Export is graph-only; proposals land in Triage until Accept → entity_changed.
      return false;
    }
    case "proposal_queue_changed": {
      return false;
    }
    case "task_changed": {
      return false;
    }
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

/**
 * First stage of an export event: marks the case dirty and starts-or-joins the
 * write fiber, returning the Effect that waits for the write. The listener
 * runs this in its own fiber and forks only the wait, so a shutdown cannot
 * drop the mark (see `handleExportEventPayloadEffect`).
 */
export function claimExportEventEffect(
  event: WatchdogEvent
): Effect.Effect<Effect.Effect<void>, never, Db> {
  if (!shouldTriggerCaseExport(event)) {
    return Effect.succeed(Effect.void);
  }
  const caseId = normalizeSchedulableCaseId(event.caseId);
  if (caseId === null) {
    return Effect.succeed(Effect.void);
  }
  return claimCaseExportEffect(caseId);
}
