import { Effect } from "effect";

import { InternalError } from "../infra/tagged-errors";

export function exportFailure(what: string) {
  return (cause: unknown) => new InternalError({ reason: what, cause });
}

/** One zip operation as an Effect: a failure is the export's own, with the step named. */
export function step(
  what: string,
  run: (signal: AbortSignal) => Promise<void>
) {
  return Effect.tryPromise({
    try: run,
    catch: exportFailure(`Case export failed: ${what}`),
  });
}
