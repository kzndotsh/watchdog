import { Effect } from "effect";

import { InternalError } from "../errors/tagged-errors";

export function exportFailure(what: string) {
  return (cause: unknown) => new InternalError({ reason: what, cause });
}

/** One zip operation: a failure is the export's own, with the step named and the cause kept. */
export function step<E>(
  what: string,
  run: Effect.Effect<void, E>
): Effect.Effect<void, InternalError> {
  return run.pipe(
    Effect.mapError(exportFailure(`Case export failed: ${what}`))
  );
}
