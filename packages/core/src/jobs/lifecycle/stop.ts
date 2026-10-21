import { Effect } from "effect";

import type { JobStopCause } from "@watchdog/schemas/shared";

import { JobFibers } from "../job-fibers";

/** Which Jobs this worker is running a stop names: one of them, or every one. */
export type StopSelector =
  | { readonly kind: "job"; readonly jobId: string }
  | { readonly kind: "running" };

/**
 * Stop Jobs this worker runs, from a source that has no transaction open (graceful shutdown, the
 * pg-boss signal, the cancel poll). It records `cause` in each attempt's stop slot (the first
 * source to offer wins) and interrupts the fiber; the attempt's release does the rest: one
 * settle with the cause, one activity entry and the Playbook advance. A Job that no fiber here
 * runs is left alone. Returns how many fibers it stopped.
 */
export function stop(
  selector: StopSelector,
  cause: JobStopCause,
  detail?: string
): Effect.Effect<number, never, JobFibers> {
  const why = detail === undefined ? { cause } : { cause, detail };
  return Effect.gen(function* stopGen() {
    const fibers = yield* JobFibers;
    if (selector.kind === "running") return yield* fibers.abortAll(why);
    return (yield* fibers.abort(selector.jobId, why)) ? 1 : 0;
  });
}
