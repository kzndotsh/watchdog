import { Context, Effect, Layer, type Scope } from "effect";

import {
  createActivityTailer,
  type ActivityRow,
  type ActivityTailer as DbActivityTailer,
  type ActivityTailerOptions,
  type DbExec,
} from "@watchdog/db";
import type { ActivityEntry } from "@watchdog/schemas/feed";

import { Db } from "../infra/db-service";
import { logProcess, logSwallowed } from "../infra/process-log";
import { InternalError } from "../infra/tagged-errors";
import { toActivityEntry } from "./append";

/** What a process reads from the activity log tail. */
export interface ActivityTailerApi {
  /**
   * Receive each commit-safe entry (`(xid, id)` order) from the tailer's cursor
   * on. The first subscriber opens the process's single LISTEN connection and
   * the last one to leave closes it. The Effect completes once the cursor is
   * initialised (replay history only after that, with `createActivityGate`) and
   * returns the unsubscribe function.
   */
  readonly subscribe: (
    listener: (entry: ActivityEntry) => void
  ) => Effect.Effect<() => void, InternalError>;
}

/**
 * The per-process activity tailer as an Effect service (ADR-0002 phase 3 style,
 * ADR-0005 decision 4). Web composes `activityTailerLayer` once in `AppLive`;
 * building it opens nothing: LISTEN starts when a first subscriber arrives and
 * the Layer's release ends it. Tests provide `Layer.succeed(ActivityTailer, ...)`
 * or `makeActivityTailerLayer` over a tailer with test timings.
 */
export class ActivityTailer extends Context.Service<
  ActivityTailer,
  ActivityTailerApi
>()("@watchdog/core/activity/ActivityTailer") {}

/** Live tailer options over `exec`: errors and stalls logged; `extra` overrides (a consumer's `startAt`, test timings). */
export function liveTailerOptions(
  exec: DbExec,
  extra: Partial<ActivityTailerOptions> = {}
): ActivityTailerOptions {
  return {
    onError: (error) => {
      logSwallowed("activity.tailer", error);
    },
    onHeldBack: (heldMs) => {
      logProcess(
        "activity.tailer",
        "delivery held back by an open transaction",
        { heldMs }
      );
    },
    ...extra,
    exec,
  };
}

function adapt(tailer: DbActivityTailer): ActivityTailerApi {
  return {
    subscribe: (listener) =>
      Effect.suspend(() => {
        const subscription = tailer.subscribe((row: ActivityRow) => {
          listener(toActivityEntry(row));
        });
        return Effect.tryPromise({
          try: () => subscription.ready,
          catch: (cause) =>
            new InternalError({
              reason: "Activity tailer failed to start",
              cause,
            }),
        }).pipe(
          Effect.tapError(() => Effect.sync(subscription.unsubscribe)),
          Effect.as(subscription.unsubscribe)
        );
      }),
  };
}

/**
 * A tailer over `exec` whose Scope's release stops it (and its LISTEN
 * connection). For a consumer that owns one for a bounded lifetime, such as
 * the worker's legacy event stream; the web process composes the Layer below.
 */
export function acquireActivityTailer(
  exec: DbExec,
  create: (exec: DbExec) => DbActivityTailer = (e) =>
    createActivityTailer(liveTailerOptions(e))
): Effect.Effect<ActivityTailerApi, never, Scope.Scope> {
  return Effect.acquireRelease(
    Effect.sync(() => create(exec)),
    (acquired) => Effect.promise(() => acquired.stop())
  ).pipe(Effect.map(adapt));
}

/**
 * A scoped `ActivityTailer` Layer over a tailer factory; the Scope's release
 * stops the tailer and its LISTEN connection. The factory receives the `Db`
 * service's client.
 */
export function makeActivityTailerLayer(
  create: (exec: DbExec) => DbActivityTailer
): Layer.Layer<ActivityTailer, never, Db> {
  return Layer.effect(
    ActivityTailer,
    Effect.gen(function* tailerLayerGen() {
      const exec = yield* Db;
      return ActivityTailer.of(yield* acquireActivityTailer(exec, create));
    })
  );
}

/** Live Layer: the db tailer over the `Db` client, errors and stalls logged. */
export const activityTailerLayer: Layer.Layer<ActivityTailer, never, Db> =
  makeActivityTailerLayer((exec) =>
    createActivityTailer(liveTailerOptions(exec))
  );
