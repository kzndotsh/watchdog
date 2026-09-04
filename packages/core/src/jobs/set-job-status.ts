import { Effect } from "effect";

import { db, jobsRepo, type JobPatch, type JobRow } from "@watchdog/db";
import type { JobStatus } from "@watchdog/schemas";

import { notifyJobUpdateEffect } from "../infra/events";
import { tryDb } from "../infra/postgres-effect";
import type { DomainTag } from "../infra/tagged-errors";

interface SetJobStatusOpts {
  unlessCancelled?: boolean;
  onlyStatuses?: JobStatus[];
  notify?: boolean;
  caseId?: string;
}

type JobStatusPatch = JobPatch & { status: JobStatus };

/**
 * Persist Job status (+ related fields). Returns the updated row, or null when
 * the update matched no row (e.g. already cancelled with unlessCancelled).
 * Optional SSE notify after a successful write.
 */
export function setJobStatusEffect(
  jobId: string,
  patch: JobStatusPatch,
  opts?: SetJobStatusOpts
): Effect.Effect<JobRow | null, DomainTag> {
  return Effect.gen(function* setJobStatusGen() {
    const updated = yield* tryDb(() =>
      jobsRepo.update(
        db,
        jobId,
        { ...patch },
        {
          unlessCancelled: opts?.unlessCancelled,
          onlyStatuses: opts?.onlyStatuses,
        }
      )
    );
    if (updated && opts?.notify === true) {
      yield* notifyJobUpdateEffect(
        opts.caseId ?? updated.caseId,
        jobId,
        patch.status
      );
    }
    return updated;
  });
}
