import { Cause, Clock, Effect, Result } from "effect";

import { db, jobsRepo, playbookRunsRepo } from "@watchdog/db";
import { isOpenJobStatus } from "@watchdog/schemas";

import { errorMessage } from "../infra/domain-error";
import { tryDb } from "../infra/postgres-effect";
import { logSwallowed } from "../infra/process-log";
import type { DomainTag } from "../infra/tagged-errors";
import { enqueueCapJobEffect } from "./boss";
import { advancePlaybookRunEffect } from "./stages/chain";
import { failJobEffect } from "./stages/helpers";
import { capExpireSeconds } from "./timeouts";

const STALE_ERROR = "worker restarted while this Job was running";

/** Avoid re-enqueueing jobs still in the normal web→boss handoff window. */
const ORPHAN_QUEUED_GRACE_MS = 120_000;

type StaleJobRow = Awaited<ReturnType<typeof jobsRepo.listRunning>>[number];

function capExpireOrUnknown(
  capabilityId: string
):
  | { readonly ok: true; readonly expireSeconds: number }
  | { readonly ok: false; readonly message: string } {
  try {
    return { ok: true, expireSeconds: capExpireSeconds(capabilityId) };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

function abandonPlaybook(
  jobId: string,
  playbookRunId: string | null,
  caseId: string
): Effect.Effect<void> {
  if (playbookRunId === null) return Effect.void;
  return advancePlaybookRunEffect({ playbookRunId, caseId }).pipe(
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        logSwallowed("reconcile.abandon", Cause.squash(cause), { jobId });
      })
    )
  );
}

function reconcileStaleJobEffect(
  row: StaleJobRow,
  now: number
): Effect.Effect<boolean, DomainTag> {
  return Effect.gen(function* reconcileStaleJobGen() {
    const cap = capExpireOrUnknown(row.capabilityId);
    if (!cap.ok) {
      yield* failJobEffect(
        row.id,
        `Unknown Capability ${row.capabilityId}: ${cap.message}`,
        { caseId: row.caseId }
      );
      yield* abandonPlaybook(row.id, row.playbookRunId, row.caseId);
      return true;
    }
    const ageMs = now - (row.startedAt ?? row.updatedAt).getTime();
    if (ageMs < cap.expireSeconds * 1000) return false;
    yield* failJobEffect(row.id, STALE_ERROR, { caseId: row.caseId });
    yield* abandonPlaybook(row.id, row.playbookRunId, row.caseId);
    return true;
  });
}

/**
 * Fail product Jobs left `running` after a hard worker crash.
 * Age threshold is per-Cap (derived expire window) so a hung dns.lookup is
 * reclaimed long before a hung url.enrich.
 */
export function reconcileStaleJobsEffect(): Effect.Effect<number, DomainTag> {
  return Effect.gen(function* reconcileStaleJobsGen() {
    const running = yield* tryDb(() => jobsRepo.listRunning(db));
    const now = yield* Clock.currentTimeMillis;
    const results = yield* Effect.forEach(
      running,
      (row) => reconcileStaleJobEffect(row, now),
      { concurrency: "unbounded" }
    );
    return results.filter(Boolean).length;
  });
}

/**
 * Re-enqueue product Jobs left `queued` without a pg-boss delivery (enqueue
 * failed after commit). `singletonKey` on send makes repeat enqueue safe.
 */
export function reconcileOrphanedQueuedJobsEffect(): Effect.Effect<
  number,
  DomainTag
> {
  return Effect.gen(function* reconcileOrphanedQueuedJobsGen() {
    const now = yield* Clock.currentTimeMillis;
    // Drizzle `listQueuedStale` expects a JS Date; Clock supplies the millis.
    // oxlint-disable-next-line effecttsgo/global-date-in-effect -- repo boundary Date interop
    const updatedBefore = new Date(now - ORPHAN_QUEUED_GRACE_MS);
    const rows = yield* tryDb(() =>
      jobsRepo.listQueuedStale(db, updatedBefore)
    );
    let enqueued = 0;
    for (const row of rows) {
      const outcome = yield* Effect.result(
        enqueueCapJobEffect(row.id, row.capabilityId)
      );
      if (Result.isFailure(outcome)) {
        yield* Effect.sync(() => {
          logSwallowed("reconcile.orphan_queued", outcome.failure, {
            jobId: row.id,
          });
        });
        continue;
      }
      enqueued += 1;
    }
    return enqueued;
  });
}

/** Re-advance playbook runs left `running` after a swallowed advance error. */
export function reconcileStuckPlaybookRunsEffect(): Effect.Effect<
  number,
  DomainTag
> {
  return Effect.gen(function* reconcileStuckPlaybookRunsGen() {
    const running = yield* tryDb(() => playbookRunsRepo.listRunning(db));
    const results = yield* Effect.forEach(
      running,
      (run) =>
        Effect.gen(function* reconcileOnePlaybookGen() {
          const members = yield* tryDb(() =>
            jobsRepo.listStatusesForPlaybookRun(db, run.id)
          );
          if (members.some((m) => isOpenJobStatus(m.status))) return false;
          return yield* advancePlaybookRunEffect({
            playbookRunId: run.id,
            caseId: run.caseId,
          }).pipe(
            Effect.as(true),
            Effect.catchCause((cause) =>
              Effect.sync(() => {
                logSwallowed(
                  "reconcile.playbook_advance",
                  Cause.squash(cause),
                  {
                    playbookRunId: run.id,
                  }
                );
                return false;
              })
            )
          );
        }),
      { concurrency: "unbounded" }
    );
    return results.filter(Boolean).length;
  });
}
