import { Effect } from "effect";

import type { DbExec, PlaybookRunRow } from "@watchdog/db";
import { isOpenJobStatus } from "@watchdog/schemas/shared";

import { jobsRepoFx, playbookRunsRepoFx } from "../infra/repos-fx";
import { ConflictError, type DomainTag } from "../infra/tagged-errors";

/** Where a retried Job goes: the Playbook run, step and fan index of the Job it repeats. */
export type PlaybookSlot = {
  playbookRunId: string;
  playbookStep: number;
  playbookFanIndex: number;
};

/**
 * Join a retry to the Playbook run of the Job it repeats (#354). Call it first in the
 * transaction that creates the retry Job: it locks the run row, which is what keeps two
 * concurrent retries of one step apart (the second finds the first's open Job and gets a
 * conflict) and keeps the retry from racing the run's own advance.
 *
 * - A `finished` run is reopened (`running`, outcome and finish time cleared); the normal
 *   tail then advances it when the retry settles, un-skipping the dependents the failed step
 *   had held back and recomputing the outcome.
 * - A `running` run takes the retry as it is.
 * - A `cancelled` run (a user stopped it) or a missing one is not resumed: the retry is
 *   standalone, as before, so the answer is `null`.
 */
export function joinPlaybookRunEffect(
  tx: DbExec,
  slot: PlaybookSlot
): Effect.Effect<PlaybookRunRow | null, DomainTag> {
  return Effect.gen(function* joinPlaybookRunGen() {
    const run = yield* playbookRunsRepoFx.lock(tx, slot.playbookRunId);
    if (!run || run.status === "cancelled") return null;

    const members = yield* jobsRepoFx.listForPlaybookRun(tx, run.id);
    const retrying = members.some(
      (job) =>
        job.playbookStep === slot.playbookStep &&
        job.playbookFanIndex === slot.playbookFanIndex &&
        isOpenJobStatus(job.status)
    );
    if (retrying) {
      return yield* new ConflictError({
        reason: "This playbook step is already being retried",
      });
    }

    if (run.status === "running") return run;
    const reopened = yield* playbookRunsRepoFx.reopen(tx, run.id);
    return reopened ?? run;
  });
}
