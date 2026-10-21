import { Effect } from "effect";

import type { DbExec } from "@watchdog/db";
import { timedDbCall } from "@watchdog/log";

import { Db } from "./db-service";
import {
  isCaseLifecycleViolation,
  isHistoryContextMissing,
  isUniqueViolation,
} from "./error-utils";
import {
  ConflictError,
  InternalError,
  mapDomainCatch,
  type DomainTag,
} from "./tagged-errors";

export type MapPostgresCatchOpts = {
  readonly uniqueIndex?: string;
  readonly conflictReason?: string;
  /** A second unique index with its own reason, checked when the first did not match. */
  readonly also?: MapPostgresCatchOpts;
};

/**
 * Unique violations become `ConflictError`; a Graph write the database refused for want of a
 * history context becomes `InternalError` (a server bug: the write path forgot
 * `setHistoryContextEffect`, never the caller's input); tagged errors pass through;
 * anything else is rethrown so it stays a defect.
 */
export function mapPostgresCatch(
  error: unknown,
  opts?: MapPostgresCatchOpts
): DomainTag {
  for (let each = opts; each !== undefined; each = each.also) {
    if (
      each.uniqueIndex !== undefined &&
      isUniqueViolation(error, each.uniqueIndex)
    ) {
      return new ConflictError({
        reason: each.conflictReason ?? `unique violation: ${each.uniqueIndex}`,
      });
    }
  }
  if (isHistoryContextMissing(error)) {
    return new InternalError({
      reason: "Graph write without a history context",
      cause: error,
    });
  }
  if (isCaseLifecycleViolation(error)) {
    return new InternalError({
      reason: "Case change without a deletion record",
      cause: error,
    });
  }
  return mapDomainCatch(error);
}

/**
 * A promise call into the domain error channel. A repo call does not use it: `xRepoFx.m(exec,
 * ...)` (`repos-fx.ts`) is the same seam (`repoFx` calls this), and `watchdog/no-repo-wrapper`
 * rejects the wrapper. What stays is a non-repo driver call, or a repo call that needs `opts`
 * (the conflict mapping reads the raw driver error).
 */
export function tryDb<A>(
  tryFn: () => Promise<A>,
  opts?: MapPostgresCatchOpts
): Effect.Effect<A, DomainTag> {
  return Effect.tryPromise({
    // The one database seam: counts and times the call for the request log event.
    try: () => timedDbCall(tryFn),
    catch: (error) => mapPostgresCatch(error, opts),
  });
}

/**
 * `tryDb` with the client taken from the `Db` service (R = `Db`) instead of the
 * module-global `db`. Same error mapping as `tryDb`. A repo call never goes through it:
 * `xRepoFxDb.m(...)` (`repos-fx.ts`); what remains is a non-repo driver call, or a repo call
 * that needs `opts`. A transaction body keeps its explicit `tx`.
 */
export function tryDbWith<A>(
  tryFn: (exec: DbExec) => Promise<A>,
  opts?: MapPostgresCatchOpts
): Effect.Effect<A, DomainTag, Db> {
  return Effect.flatMap(Effect.service(Db), (exec) =>
    tryDb(() => tryFn(exec), opts)
  );
}

/** What a write returns when it landed: anything but a missing row or `false`. */
type Written<A> = Exclude<A, null | undefined | false>;

function isWritten<A>(value: A): value is Written<A> {
  return value !== null && value !== undefined && value !== false;
}

/**
 * The one place a write that should have produced a row (or `true`, for link writes) turns a
 * miss into `InternalError`. Pipe a write through it:
 * `claimsRepoFx.create(tx, row).pipe(requireWritten("create Claim"))`. The reason is
 * `Failed to <what>`; the API sends a fixed 500 message instead (a Job failure still stores the
 * reason on the Job row). Use `NotFoundError({ entity, id })` instead when the caller named a
 * row that legitimately may not exist (update/delete by id).
 */
export function requireWritten(what: string) {
  return <A, E, R>(
    self: Effect.Effect<A, E, R>
  ): Effect.Effect<Written<A>, E | InternalError, R> =>
    Effect.filterOrFail(
      self,
      isWritten,
      () => new InternalError({ reason: `Failed to ${what}` })
    );
}
