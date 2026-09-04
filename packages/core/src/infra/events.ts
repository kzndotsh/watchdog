import { Data, Effect } from "effect";

import { notifyEvent } from "@watchdog/db";
import type { WatchdogEvent } from "@watchdog/db";

import { logSwallowed } from "./process-log";

export {
  isWatchdogEvent,
  notifyEvent,
  listenForEvents,
  WATCHDOG_CHANNEL,
  type WatchdogEvent,
} from "@watchdog/db";

class NotifyFailed extends Data.TaggedError("NotifyFailed")<{
  readonly cause: unknown;
}> {}

function notifyWatchdogEventEffect(event: WatchdogEvent): Effect.Effect<void> {
  return Effect.tryPromise({
    try: () => notifyEvent(event),
    catch: (cause) => new NotifyFailed({ cause }),
  }).pipe(
    Effect.tapError((error) =>
      Effect.sync(() => {
        logSwallowed("notify.watchdog_event", error.cause, {
          type: event.type,
        });
      })
    ),
    Effect.ignore
  );
}

/**
 * Fan-out after a Case graph mutation. Call only after commit — SSE clients
 * refetch on receipt and would otherwise read pre-commit state.
 */
export function notifyEntityChangedEffect(caseId: string): Effect.Effect<void> {
  return notifyWatchdogEventEffect({ type: "entity_changed", caseId }).pipe(
    Effect.forkDetach({ startImmediately: true }),
    Effect.asVoid
  );
}

/**
 * Fan-out after a Task mutation. Tasks are not Graph writes — separate event
 * so dossier/board consumers can invalidate without graph refetch.
 */
export function notifyTaskChangedEffect(
  caseId: string,
  entityId?: string
): Effect.Effect<void> {
  return notifyWatchdogEventEffect(
    entityId === undefined
      ? { type: "task_changed", caseId }
      : { type: "task_changed", caseId, entityId }
  ).pipe(Effect.forkDetach({ startImmediately: true }), Effect.asVoid);
}

export function notifyProposalCreatedEffect(
  caseId: string,
  proposalId: string
): Effect.Effect<void> {
  return notifyWatchdogEventEffect({
    type: "proposal_created",
    caseId,
    proposalId,
  }).pipe(Effect.forkDetach({ startImmediately: true }), Effect.asVoid);
}

export function notifyJobUpdateEffect(
  caseId: string,
  jobId: string,
  status: string
): Effect.Effect<void> {
  return notifyWatchdogEventEffect({
    type: "job_update",
    caseId,
    jobId,
    status,
  }).pipe(Effect.forkDetach({ startImmediately: true }), Effect.asVoid);
}
