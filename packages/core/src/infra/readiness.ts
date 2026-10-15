import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { Cause, Effect, Option } from "effect";

import { activityFloorRepo, type DbExec } from "@watchdog/db";

import { BlobStore } from "./blob-store";
import type { Db } from "./db-service";
import { tryDbWith } from "./postgres-effect";
import { logProcess, logSwallowed } from "./process-log";
import { InternalError } from "./tagged-errors";

/** How long each dependency check may take before it counts as `timeout`. */
export const READINESS_TIMEOUT_MS = 3000;

/** Why a dependency is not ready. Fixed codes only: driver text never reaches a caller. */
export const READINESS_REASONS = ["timeout", "unreachable"] as const;

export type ReadinessReason = (typeof READINESS_REASONS)[number];

export type DependencyStatus = "ok" | ReadinessReason;

export type ReadinessReport = {
  /** True only when every dependency is `ok`. */
  readonly ok: boolean;
  readonly database: DependencyStatus;
  readonly storage: DependencyStatus;
};

type Dependency = "database" | "storage";

/**
 * Run one check under the timeout and fold every outcome into a status: the
 * Effect never fails. A failure or a thrown defect is `unreachable`, an
 * expired timeout is `timeout`. The detail goes to the process log only.
 */
function probe<E, R>(
  dependency: Dependency,
  check: Effect.Effect<unknown, E, R>
): Effect.Effect<DependencyStatus, never, R> {
  return check.pipe(
    Effect.timeoutOption(READINESS_TIMEOUT_MS),
    Effect.map((answered): DependencyStatus => {
      if (Option.isSome(answered)) return "ok";
      logProcess(`readiness.${dependency}`, "check timed out", {
        timeoutMs: READINESS_TIMEOUT_MS,
      });
      return "timeout";
    }),
    Effect.catchCause((cause) =>
      Effect.sync((): DependencyStatus => {
        logSwallowed(`readiness.${dependency}`, Cause.squash(cause));
        return "unreachable";
      })
    )
  );
}

/**
 * The readiness check over any two probes, run in parallel, each under
 * `READINESS_TIMEOUT_MS`. Split from `checkReadinessEffect` so the status and
 * leak rules are tested with plain stub Effects.
 */
export function readinessFrom<ED, ES, RD, RS>(probes: {
  readonly database: Effect.Effect<unknown, ED, RD>;
  readonly storage: Effect.Effect<unknown, ES, RS>;
}): Effect.Effect<ReadinessReport, never, RD | RS> {
  return Effect.all(
    {
      database: probe("database", probes.database),
      storage: probe("storage", probes.storage),
    },
    { concurrency: 2 }
  ).pipe(
    Effect.map((statuses) => ({
      ok: statuses.database === "ok" && statuses.storage === "ok",
      ...statuses,
    }))
  );
}

/** The ping each pool has in flight, so concurrent probes share one query. */
const databasePings = new WeakMap<object, Promise<unknown>>();

/**
 * One ping per pool at a time. The timeout interrupts the Effect, not the
 * postgres.js query behind it, so a hung database would otherwise leave one
 * held connection per probe and drain the pool the app itself uses. A probe
 * that arrives while the previous ping is still out waits on that same
 * promise (and times out with it) instead of opening another.
 */
function pingOnce(exec: DbExec): Promise<unknown> {
  const inFlight = databasePings.get(exec);
  if (inFlight !== undefined) return inFlight;
  const ping = activityFloorRepo.get(exec).finally(() => {
    databasePings.delete(exec);
  });
  databasePings.set(exec, ping);
  return ping;
}

/** A one-row read of the activity floor table: a real round trip through the pool. */
const pingDatabase = tryDbWith(pingOnce);

/** `HeadBucket` on the configured bucket; the timeout aborts the request. */
const pingStorage = Effect.gen(function* pingStorageGen() {
  const { client, bucket } = yield* BlobStore;
  yield* Effect.tryPromise({
    try: (signal) =>
      client.send(new HeadBucketCommand({ Bucket: bucket }), {
        abortSignal: signal,
      }),
    catch: (cause) =>
      new InternalError({ reason: "Object storage head failed", cause }),
  });
});

/**
 * Readiness: can this instance reach Postgres and object storage right now.
 * Never fails: every problem is a status in the report (see {@link probe}).
 */
export const checkReadinessEffect: Effect.Effect<
  ReadinessReport,
  never,
  Db | BlobStore
> = readinessFrom({ database: pingDatabase, storage: pingStorage });
