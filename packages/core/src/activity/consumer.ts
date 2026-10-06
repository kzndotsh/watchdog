import { Cause, Effect, Queue } from "effect";

import {
  activityCursorsRepo,
  activityLogRepo,
  casesRepo,
  createActivityTailer,
  type ActivityTailerOptions,
} from "@watchdog/db";
import {
  compareActivityCursor,
  parseActivityCursor,
  type ActivityCursor,
  type ActivityEntry,
} from "@watchdog/schemas/feed";
import type { CaseId } from "@watchdog/schemas/shared";

import { Db } from "../infra/db-service";
import { tryDbWith } from "../infra/postgres-effect";
import { logSwallowed } from "../infra/process-log";
import { InternalError, type DomainTag } from "../infra/tagged-errors";
import { acquireActivityTailer, liveTailerOptions } from "./tailer";

export interface ActivityConsumerOpts {
  /** Names the durable cursor row (`activity_cursors.consumer`). */
  consumer: string;
  /**
   * Handle one entry. The entry counts as handled when this returns; the
   * cursor moves past it only then. Keep it to claiming or scheduling work
   * (the worker marks a Case dirty and forks the wait): a defect here ends the
   * consumer with the cursor still before the entry.
   */
  handle: (entry: ActivityEntry) => Effect.Effect<void>;
  /**
   * The cursor is ahead of the database (a restore or a wiped log): entries
   * between it and the head are unknowable, so every Case is rescanned. The
   * cursor moves to the head once this returns.
   */
  onResync: (caseIds: readonly CaseId[]) => Effect.Effect<void>;
  /** The tailer is subscribed from the stored cursor (catch-up has begun). */
  onReady?: () => void;
  /** LISTEN could not be established; the consumer keeps polling. */
  onListenError?: (error: unknown) => void;
  /** Tailer timings for tests (`pollMs`, `repollMs`, `listen`). */
  tailer?: Partial<ActivityTailerOptions>;
}

function isAheadOfLog(
  cursor: ActivityCursor,
  newest: ActivityCursor | null
): boolean {
  return compareActivityCursor(cursor, newest ?? { xid: "0", id: 0 }) > 0;
}

/** Where to resume: the stored cursor, the head on a first boot, or the head after a resync. */
function resolveStartEffect(
  opts: ActivityConsumerOpts
): Effect.Effect<ActivityCursor, DomainTag, Db> {
  return Effect.gen(function* resolveStartGen() {
    const stored = yield* tryDbWith((exec) =>
      activityCursorsRepo.get(exec, opts.consumer)
    );
    if (stored === null) {
      // A first boot starts at the head: history is not replayed.
      const head = yield* tryDbWith((exec) => activityLogRepo.head(exec));
      yield* tryDbWith((exec) =>
        activityCursorsRepo.set(exec, opts.consumer, head)
      );
      return head;
    }
    const newest = yield* tryDbWith((exec) => activityLogRepo.newest(exec));
    if (!isAheadOfLog(stored, newest)) return stored;
    // Read the head before the scan: a change committed after it is past the
    // head and arrives through the tail, one committed before is in the scan.
    const head = yield* tryDbWith((exec) => activityLogRepo.head(exec));
    const caseIds = yield* tryDbWith((exec) =>
      casesRepo.listAllIdsUnchecked(exec)
    );
    yield* opts.onResync(caseIds);
    yield* tryDbWith((exec) =>
      activityCursorsRepo.set(exec, opts.consumer, head)
    );
    return head;
  });
}

/**
 * A durable consumer of the activity log (ADR-0005 decision 4, S5). Runs until
 * interrupted (or until a handler dies).
 *
 * 1. Resume point: the consumer's stored cursor; none (first boot) means the
 *    head; a cursor ahead of the log means a resync (`onResync`, then the head).
 * 2. A tailer started at that cursor delivers every commit-safe entry past it
 *    (catch-up for what happened while the process was down), then the live
 *    tail, in `(xid, id)` order, into one queue.
 * 3. Entries are handled in order. The cursor is stored after a batch whose
 *    entries were all handled, never before: a crash replays the batch
 *    (at-least-once), it cannot skip one.
 *
 * Not yet handled: a retention floor. Pruning lands in S7; a cursor older than
 * the floor then joins the resync case.
 */
export function runActivityConsumerEffect(
  opts: ActivityConsumerOpts
): Effect.Effect<never, DomainTag, Db> {
  return Effect.gen(function* runActivityConsumerGen() {
    const exec = yield* Db;
    const start = yield* resolveStartEffect(opts);
    const queue = yield* Queue.unbounded<ActivityEntry>();
    const tailer = yield* acquireActivityTailer(exec, (e) =>
      createActivityTailer(
        liveTailerOptions(e, {
          ...opts.tailer,
          startAt: start,
          onListenError: opts.onListenError,
        })
      )
    );
    const unsubscribe = yield* tailer.subscribe((entry) => {
      Queue.offerUnsafe(queue, entry);
    });
    yield* Effect.addFinalizer(() => Effect.sync(unsubscribe));
    opts.onReady?.();
    return yield* Effect.forever(
      Effect.gen(function* consumeBatchGen() {
        const batch = yield* Queue.takeAll(queue);
        for (const entry of batch) yield* opts.handle(entry);
        const last = batch.at(-1);
        const cursor =
          last === undefined ? null : parseActivityCursor(last.cursor);
        if (cursor === null) {
          return yield* new InternalError({
            reason: "Activity entry carries an unparsable cursor",
          });
        }
        // A failed write only delays the cursor: the next batch stores a later
        // one, and a crash before then replays this batch.
        yield* tryDbWith((e) =>
          activityCursorsRepo.set(e, opts.consumer, cursor)
        ).pipe(
          Effect.catchCause((cause) =>
            Effect.sync(() => {
              logSwallowed("activity.consumer", Cause.squash(cause), {
                consumer: opts.consumer,
              });
            })
          )
        );
      })
    );
  }).pipe(Effect.scoped);
}
