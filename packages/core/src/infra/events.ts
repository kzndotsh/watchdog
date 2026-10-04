import { Data, Effect } from "effect";

import {
  listenForEvents as dbListenForEvents,
  notifyEvent,
} from "@watchdog/db";
import {
  watchdogEventSchema,
  type WatchdogEvent,
} from "@watchdog/schemas/feed";

import { logSwallowed } from "./process-log";

/**
 * Callback LISTEN for the SSE route. Core owns this entry so apps/web, which must not
 * import `@watchdog/db`, reaches Postgres LISTEN through core.
 */
export function listenForEvents(
  ...args: Parameters<typeof dbListenForEvents>
): ReturnType<typeof dbListenForEvents> {
  return dbListenForEvents(...args);
}

class NotifyError extends Data.TaggedError("NotifyError")<{
  readonly cause: unknown;
}> {
  readonly code = "notify_failed" as const;
}

function notifyWatchdogEventEffect(event: WatchdogEvent): Effect.Effect<void> {
  const parsed = watchdogEventSchema.safeParse(event);
  if (!parsed.success) {
    return Effect.void;
  }
  const validated = parsed.data;
  return Effect.tryPromise({
    try: () => notifyEvent(validated),
    catch: (cause) => new NotifyError({ cause }),
  }).pipe(
    Effect.tapError((error) =>
      Effect.sync(() => {
        logSwallowed("notify.watchdog_event", error.cause, {
          type: validated.type,
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
 * Fan-out after Evidence mutations (dump, attach, hide/restore). Collect and
 * intake consumers invalidate evidence queries on receipt.
 */
export function notifyEvidenceChangedEffect(
  caseId: string,
  evidenceId?: string
): Effect.Effect<void> {
  return notifyWatchdogEventEffect(
    evidenceId === undefined
      ? { type: "evidence_changed", caseId }
      : { type: "evidence_changed", caseId, evidenceId }
  ).pipe(Effect.forkDetach({ startImmediately: true }), Effect.asVoid);
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

/** Fan-out after accept/reject — Triage and overview pending counts. */
export function notifyProposalQueueChangedEffect(
  caseId: string
): Effect.Effect<void> {
  return notifyWatchdogEventEffect({
    type: "proposal_queue_changed",
    caseId,
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
