import { Effect } from "effect";

import { scheduleCaseExportEffect, type WatchdogEvent } from "@watchdog/core";

export function shouldTriggerCaseExport(event: WatchdogEvent): boolean {
  switch (event.type) {
    case "job_update": {
      return event.status === "succeeded";
    }
    case "entity_changed":
    case "proposal_created": {
      return true;
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
): Effect.Effect<void> {
  if (!shouldTriggerCaseExport(event)) {
    return Effect.void;
  }
  return scheduleCaseExportEffect(event.caseId).pipe(
    Effect.forkDetach({ startImmediately: true }),
    Effect.asVoid
  );
}
