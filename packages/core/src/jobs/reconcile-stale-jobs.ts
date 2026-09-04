import { Cause, Effect } from "effect";

import { db, jobsRepo, playbookRunsRepo } from "@watchdog/db";
import { isOpenJobStatus } from "@watchdog/schemas";

import { errorMessage } from "../infra/domain-error";
import { tryDb } from "../infra/postgres-effect";
import { logSwallowed } from "../infra/process-log";
import { toDomainError, type DomainTag } from "../infra/tagged-errors";
import { advancePlaybookRunEffect } from "./stages/chain";
import { failJobEffect } from "./stages/helpers";
import { capExpireSeconds } from "./timeouts";

const STALE_ERROR = "worker restarted while this Job was running";

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
  playbookRunId: string | null
): Effect.Effect<void> {
  if (playbookRunId === null) return Effect.void;
  return advancePlaybookRunEffect({ playbookRunId }).pipe(
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
        `Unknown Capability ${row.capabilityId}: ${cap.message}`
      );
      yield* abandonPlaybook(row.id, row.playbookRunId);
      return true;
    }
    const ageMs = now - row.updatedAt.getTime();
    if (ageMs < cap.expireSeconds * 1000) return false;
    yield* failJobEffect(row.id, STALE_ERROR);
    yield* abandonPlaybook(row.id, row.playbookRunId);
    return true;
  });
}

/**
 * Fail product Jobs left `running` after a hard worker crash.
 * Age threshold is per-Cap (derived expire window) so a hung dns.lookup is
 * reclaimed long before a hung url.enrich.
 */
export function reconcileStaleJobsEffect(): Effect.Effect<number> {
  return Effect.gen(function* reconcileStaleJobsGen() {
    const running = yield* tryDb(() => jobsRepo.listRunning(db));
    const now = Date.now();
    const results = yield* Effect.forEach(
      running,
      (row) => reconcileStaleJobEffect(row, now),
      { concurrency: "unbounded" }
    );
    return results.filter(Boolean).length;
  }).pipe(Effect.mapError(toDomainError), Effect.orDie);
}

/** Re-advance playbook runs left `running` after a swallowed advance error. */
export function reconcileStuckPlaybookRunsEffect(): Effect.Effect<number> {
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
  }).pipe(Effect.mapError(toDomainError), Effect.orDie);
}
