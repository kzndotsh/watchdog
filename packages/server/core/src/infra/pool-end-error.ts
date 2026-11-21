import { Data } from "effect";

/** The pool failed to end; only ever logged by `Db.ownedBy`'s release. */
export class PoolEndError extends Data.TaggedError("PoolEndError")<{
  readonly cause: unknown;
}> {
  readonly code = "pool_end" as const;
}
