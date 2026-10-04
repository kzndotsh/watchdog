import { Effect } from "effect";

import { scheduleCaseExportEffect, type Db } from "@watchdog/core/worker";
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

export function handleExportEventEffect(
  event: WatchdogEvent
): Effect.Effect<void, never, Db> {
  if (!shouldTriggerCaseExport(event)) {
    return Effect.void;
  }
  const caseId = normalizeSchedulableCaseId(event.caseId);
  if (caseId === null) {
    return Effect.void;
  }
  return scheduleCaseExportEffect(caseId);
}
