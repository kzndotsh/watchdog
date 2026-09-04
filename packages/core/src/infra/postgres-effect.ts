import { Effect } from "effect";

import { isUniqueViolation } from "./domain-error";
import { ConflictError, mapDomainCatch, type DomainTag } from "./tagged-errors";

export interface MapPostgresCatchOpts {
  readonly uniqueIndex?: string;
  readonly conflictReason?: string;
}

/**
 * Unique violations become `ConflictError`; other DomainErrors map 1:1;
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
