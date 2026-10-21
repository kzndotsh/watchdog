import { Effect } from "effect";

import { jobsRepo, type JobRow, type JobSettlePatch } from "@watchdog/db";
import { parseTrimmedCaseId, parseTrimmedUuid } from "@watchdog/schemas/shared";
import type { CaseId } from "@watchdog/schemas/shared";

import type { Db } from "../../infra/db-service";
import { tryDb } from "../../infra/postgres-effect";
import { transact } from "../../infra/postgres-tx";
import type { DomainTag } from "../../infra/tagged-errors";
import { appendJobActivityEffect } from "../job-activity";
import { allowedFromStatuses, decideJob, type JobEvent } from "./table";

/** The columns a settle may set besides the status and stop code, which the event decides. */
export type JobSettleFields = Omit<JobSettlePatch, "status" | "errorCode">;

/**
 * Apply a lifecycle event to a Job: the one writer of `jobs.status` for claim, finish, fail
 * and reclaim. In one transaction it locks the Job, asks {@link decideJob}, and writes with
 * the SQL guard derived from the same table, so a Job in a terminal status never moves.
 * Returns the updated row, or null when the event does nothing (the Job is missing, in
 * another Case, or its status has no move for the event). A change of status appends its
 * activity entry in the same transaction (ADR-0005); the database trigger notifies at commit.
 */
export function settleJobEffect(
  target: { readonly jobId: string; readonly caseId: CaseId },
  event: JobEvent,
  fields: JobSettleFields = {}
): Effect.Effect<JobRow | null, DomainTag, Db> {
  return Effect.gen(function* settleJobGen() {
    const jobId = parseTrimmedUuid(target.jobId) ?? undefined;
    const caseId = parseTrimmedCaseId(target.caseId) ?? undefined;
    if (jobId === undefined || caseId === undefined) return null;
    return yield* transact((tx) =>
      Effect.gen(function* settleJobTx() {
        const before = yield* tryDb(() => jobsRepo.lockStatus(tx, jobId));
        if (before === null) return null;
        const decision = decideJob(before, event);
        if (decision.kind === "none") return null;
        const updated = yield* tryDb(() =>
          jobsRepo.settle(
            tx,
            caseId,
            jobId,
            {
              ...fields,
              status: decision.next,
              errorCode: decision.errorCode,
            },
            allowedFromStatuses(event.kind)
          )
        );
        // A reclaim sets a running Job running again: only a real move is an entry.
        if (updated && before.status !== decision.next) {
          yield* appendJobActivityEffect(tx, updated, decision.next);
        }
        return updated;
      })
    );
  });
}
