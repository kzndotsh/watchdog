import { Data, Effect } from "effect";

import {
  listenForEvents as dbListenForEvents,
  notifyEvent,
} from "@watchdog/db";
import {
  watchdogEventSchema,
  type WatchdogEvent,
} from "@watchdog/schemas/feed";
import type { CaseId } from "@watchdog/schemas/shared";

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
export function notifyEntityChangedEffect(caseId: CaseId): Effect.Effect<void> {
  return notifyWatchdogEventEffect({ type: "entity_changed", caseId }).pipe(
    Effect.forkDetach({ startImmediately: true }),
    Effect.asVoid
  );
}

export function notifyJobUpdateEffect(
  caseId: CaseId,
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
