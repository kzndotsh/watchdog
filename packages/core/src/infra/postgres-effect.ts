import { Effect } from "effect";

import type { DbExec } from "@watchdog/db";

import { Db } from "./db-service";
import { isUniqueViolation } from "./error-utils";
import { ConflictError, mapDomainCatch, type DomainTag } from "./tagged-errors";

export interface MapPostgresCatchOpts {
  readonly uniqueIndex?: string;
  readonly conflictReason?: string;
}

/**
 * Unique violations become `ConflictError`; tagged errors pass through;
 * anything else is rethrown so it stays a defect.
 */
export function mapPostgresCatch(
  error: unknown,
  opts?: MapPostgresCatchOpts
): DomainTag {
  if (
    opts?.uniqueIndex !== undefined &&
    isUniqueViolation(error, opts.uniqueIndex)
  ) {
    return new ConflictError({
      reason: opts.conflictReason ?? `unique violation: ${opts.uniqueIndex}`,
    });
  }
  return mapDomainCatch(error);
}

export function tryDb<A>(
  tryFn: () => Promise<A>,
  opts?: MapPostgresCatchOpts
): Effect.Effect<A, DomainTag> {
  return Effect.tryPromise({
    try: tryFn,
    catch: (error) => mapPostgresCatch(error, opts),
  });
}

/**
 * `tryDb` with the client taken from the `Db` service (R = `Db`) instead of the
 * module-global `db`. Same error mapping as `tryDb`. A transaction body keeps
 * using its explicit `tx` and plain `tryDb(() => repo.x(tx, ...))`.
 */
export function tryDbWith<A>(
  tryFn: (exec: DbExec) => Promise<A>,
  opts?: MapPostgresCatchOpts
): Effect.Effect<A, DomainTag, Db> {
  return Effect.flatMap(Effect.service(Db), (exec) =>
    tryDb(() => tryFn(exec), opts)
  );
}
