import { Effect } from "effect";

import { jobsRepo, type JobPatch, type JobRow } from "@watchdog/db";
import type { CaseId, JobStatus } from "@watchdog/schemas/shared";
import { parseTrimmedCaseId, parseTrimmedUuid } from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import { tryDb } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import type { DomainTag } from "../infra/tagged-errors";
import { appendJobActivityEffect } from "./job-activity";

interface SetJobStatusOpts {
  caseId: CaseId;
  unlessCancelled?: boolean;
  onlyStatuses?: JobStatus[];
}

type JobStatusPatch = JobPatch & { status: JobStatus };

/**
 * Persist Job status (+ related fields). Returns the updated row, or null when
 * the update matched no row (e.g. already cancelled with unlessCancelled).
 * A matched write that changes the status appends its activity entry (queued,
 * running or a terminal state) in the same transaction (ADR-0005); the database trigger notifies at
 * commit, so there is no separate SSE notify.
 */
export function setJobStatusEffect(
  jobId: string,
  patch: JobStatusPatch,
  opts: SetJobStatusOpts
): Effect.Effect<JobRow | null, DomainTag, Db> {
  return Effect.gen(function* setJobStatusGen() {
    const normalizedJobId = parseTrimmedUuid(jobId) ?? undefined;
    const scopedCaseId = parseTrimmedCaseId(opts.caseId) ?? undefined;
    if (normalizedJobId === undefined || scopedCaseId === undefined) {
      return null;
    }
    const updateOpts = {
      unlessCancelled: opts?.unlessCancelled,
      onlyStatuses: opts?.onlyStatuses,
    };
    return yield* transact((tx) =>
      Effect.gen(function* setJobStatusTx() {
        // The write may match without changing the status (a reclaim sets an
        // already running Job running again): only a real transition is an entry.
        const before = yield* tryDb(() =>
          jobsRepo.getStatusAndPlaybook(tx, normalizedJobId)
        );
        const updated = yield* tryDb(() =>
          jobsRepo.updateInCase(
            tx,
            scopedCaseId,
            normalizedJobId,
            { ...patch },
            updateOpts
          )
        );
        if (updated && before?.status !== patch.status) {
          yield* appendJobActivityEffect(tx, updated, patch.status);
        }
        return updated;
      })
    );
  });
}
