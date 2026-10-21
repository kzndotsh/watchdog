import { Cause, Effect } from "effect";

import {
  caseDeletionRecordsRepo,
  casesRepo,
  setGraphHistoryContext,
  type CasePurgeCounts,
} from "@watchdog/db";
import type { CaseId, OrganizationId } from "@watchdog/schemas/shared";

import { optionalActorId } from "../actors/require-actor-id";
import { requireTrimmedCaseIdEffect } from "../graph/patch/guards";
import { deleteCaseArtifactsEffect } from "../infra/blob";
import type { BlobStore } from "../infra/blob-store";
import { nowDateEffect } from "../infra/clock";
import type { Db } from "../infra/db-service";
import { removeCaseExportDirEffect } from "../infra/export-sync";
import { tryDb, tryDbWith, requireWritten } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import { logProcess, logSwallowed } from "../infra/process-log";
import {
  ConflictError,
  InternalError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { requireOrganizationManagerEffect } from "../organization/roles";
import { recordDeletionEventEffect } from "./deletion-event";
import {
  boundedMessage,
  MANAGE_REASON,
  tombstoneInTx,
  type CaseActor,
} from "./tombstone";

const SYSTEM_LABEL = "system";

/** Cases one scheduled purge run takes; the rest wait for the next run. */
export const PURGE_BATCH = 20;

/**
 * Run one step of a purge and turn any way it can end badly (a typed failure or a defect such as
 * an unmapped driver error) into a value, so the caller records it on the Case instead of the
 * whole scheduled run dying with the Case left unmarked.
 */
function attempt<A, E, R>(
  step: Effect.Effect<A, E, R>
): Effect.Effect<
  { ok: true; value: A } | { ok: false; error: unknown },
  never,
  R
> {
  return step.pipe(
    Effect.map((value) => ({ ok: true as const, value })),
    Effect.catchCause((cause) =>
      Effect.succeed({ ok: false as const, error: Cause.squash(cause) })
    )
  );
}

/**
 * Remember a failed purge attempt on the Case and log it; the scheduled run retries. A failure
 * with the same message as the one already stored writes nothing (an hourly retry of the same
 * outage must not add a record an hour); a new message writes the `purge_failed` record and the
 * error in one transaction.
 */
function recordPurgeFailureEffect(
  caseId: CaseId,
  error: unknown
): Effect.Effect<{ kind: "failed"; reason: string }, never, Db> {
  const reason = boundedMessage(error);
  return transact((tx) =>
    Effect.gen(function* recordPurgeFailureTx() {
      const locked = yield* tryDb(() =>
        casesRepo.lockDeletedForPurge(tx, caseId)
      );
      if (locked === null || locked.purgeError === reason) return;
      yield* recordDeletionEventEffect(tx, locked, "purge_failed", {
        actorId: null,
        actorLabel: SYSTEM_LABEL,
      });
      yield* tryDb(() => casesRepo.recordDeletedPurgeError(tx, caseId, reason));
    })
  ).pipe(
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        logSwallowed("case.purge.record-error", Cause.squash(cause), {
          caseId,
        });
      })
    ),
    Effect.tap(() =>
      Effect.sync(() => {
        logSwallowed("case.purge", error, { caseId });
      })
    ),
    Effect.as({ kind: "failed" as const, reason })
  );
}

export type PurgeOutcome =
  | { kind: "purged"; counts: CasePurgeCounts }
  /** Gone, restored, or another purge holds it: nothing for this call to do. */
  | { kind: "skipped" }
  /** The files could not be erased or the delete failed; recorded on the Case, retried by the next run. */
  | { kind: "failed"; reason: string };

/**
 * Erase one tombstoned Case for good, whoever asks (the scheduled job, Purge now, an organization
 * delete). Three steps, each safe to repeat:
 *
 * 1. Lock the tombstone (`SKIP LOCKED`, so a concurrent purge moves on) and mark the purge
 *    begun: from here a restore is refused, because the files are about to go.
 * 2. Delete the Case's objects (everything under `{caseId}/`). A failure is recorded on the Case
 *    (`purge_error`, shown in Deleted Cases) and returned as `failed`; the Case stays deleted and
 *    the next scheduled run retries it, so a half-purged Case is never invisible forever.
 * 3. In one transaction: set the `system` history context the application role needs for a Case
 *    delete (#352), write the permanent `purged` record with what is erased, and delete the Case
 *    (the foreign keys cascade through the Graph, its history, Evidence, Jobs and the activity
 *    log, as the application role: a cascade runs as the table owner, so no owner login is
 *    needed). Then a second object sweep catches anything a straggling Job wrote meanwhile.
 */
export function purgeTombstonedCaseEffect(
  caseId: CaseId,
  actor: CaseActor
): Effect.Effect<PurgeOutcome, DomainTag, Db | BlobStore> {
  return Effect.gen(function* purgeTombstonedCaseGen() {
    const actorId = optionalActorId(actor.actorId);
    const actorLabel =
      actor.actorLabel ?? (actorId === undefined ? SYSTEM_LABEL : null);
    const now = yield* nowDateEffect;

    const claimed = yield* transact((tx) =>
      Effect.gen(function* claimPurgeTx() {
        const locked = yield* tryDb(() =>
          casesRepo.lockDeletedForPurge(tx, caseId)
        );
        if (locked === null) return null;
        // Only the first start counts (and is recorded); a retry leaves the mark alone.
        if (locked.purgeStartedAt === null) {
          yield* recordDeletionEventEffect(tx, locked, "purge_started", {
            actorId: actorId ?? null,
            actorLabel,
          });
          yield* tryDb(() =>
            casesRepo.markDeletedPurgeStarted(tx, caseId, now)
          );
        }
        return locked;
      })
    );
    if (claimed === null) return { kind: "skipped" as const };

    const blobs = yield* attempt(deleteCaseArtifactsEffect(caseId));
    if (!blobs.ok) return yield* recordPurgeFailureEffect(caseId, blobs.error);

    const erased = yield* attempt(
      transact((tx) =>
        Effect.gen(function* purgeCaseTx() {
          const locked = yield* tryDb(() =>
            casesRepo.lockDeletedForPurge(tx, caseId)
          );
          if (locked === null) return null;
          // A Case delete by the application role needs a history context (#352).
          yield* tryDb(() =>
            setGraphHistoryContext(tx, {
              actorId: actorId ?? undefined,
              actorLabel: actorLabel ?? undefined,
              channel: "system",
            })
          );
          const counts = yield* tryDb(() =>
            caseDeletionRecordsRepo.countPurgeContent(tx, caseId)
          );
          yield* recordDeletionEventEffect(
            tx,
            locked,
            "purged",
            { actorId: actorId ?? null, actorLabel },
            counts
          );
          yield* tryDb(() => casesRepo.purgeDeleted(tx, caseId)).pipe(
            requireWritten("purge Case")
          );
          return {
            counts,
            slug: locked.slug,
            organizationId: locked.organizationId,
          };
        })
      )
    );
    if (!erased.ok)
      return yield* recordPurgeFailureEffect(caseId, erased.error);
    if (erased.value === null) return { kind: "skipped" as const };

    const { counts, slug, organizationId } = erased.value;
    yield* deleteCaseArtifactsEffect(caseId).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          logSwallowed("case.purge.sweep", error, { caseId });
        })
      )
    );
    yield* removeCaseExportDirEffect(organizationId, slug).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          logSwallowed("delete-case-export", error, { slug });
        })
      )
    );
    logProcess("case.purge", "Case purged", {
      caseId,
      ...(actorId === undefined ? { system: true } : { actorId }),
    });
    return { kind: "purged" as const, counts };
  });
}

/**
 * Purge now (owner or admin, session only: the API refuses a key before this runs). The Case
 * must already be deleted; a live Case is a `conflict`. A failed erase surfaces as `internal`
 * after it is recorded on the Case and left for the scheduled retry.
 */
export function purgeCaseEffect(
  id: CaseId,
  opts: CaseActor & { organizationId: OrganizationId }
): Effect.Effect<void, DomainTag, Db | BlobStore> {
  return Effect.gen(function* purgeCaseGen() {
    yield* requireOrganizationManagerEffect({
      organizationId: opts.organizationId,
      actorId: optionalActorId(opts.actorId),
      reason: MANAGE_REASON,
    });
    const caseId = yield* requireTrimmedCaseIdEffect(id);
    const row = yield* tryDbWith((exec) =>
      casesRepo.getByIdIncludingDeleted(exec, caseId, opts.organizationId)
    );
    if (row === null) {
      return yield* new NotFoundError({ entity: "Case", id: caseId });
    }
    if (row.deletedAt === null) {
      return yield* new ConflictError({
        reason: "Only a deleted Case can be purged; delete it first",
      });
    }
    const outcome = yield* purgeTombstonedCaseEffect(caseId, opts);
    if (outcome.kind === "failed") {
      return yield* new InternalError({
        reason: `Failed to purge Case: ${outcome.reason}`,
      });
    }
    if (outcome.kind === "skipped") {
      // Skipped: another transaction held the Case (a restore, or another purge). Wait for it to
      // end (a share lock waits on its row lock) and read what is left: only a Case that is gone
      // was purged. A Case that is live again was restored; one still deleted means the other
      // purge did not finish, so say nothing was purged.
      const after = yield* tryDbWith((exec) =>
        casesRepo.getByIdIncludingDeleted(exec, caseId, opts.organizationId, {
          lock: "share",
        })
      );
      if (after !== null) {
        return yield* new ConflictError({
          reason:
            after.deletedAt === null
              ? "This Case was restored, so it was not purged"
              : "A restore or another purge is in progress for this Case; try again",
        });
      }
    }
  });
}

export type PurgeRunSummary = {
  purged: number;
  failed: number;
  skipped: number;
};

/**
 * The scheduled purge (the worker runs it at boot and then on a timer): every tombstone past the
 * restore window, plus any purge that began and did not finish, oldest first, at most
 * {@link PURGE_BATCH} per run. Each Case is independent (one failure does not stop the next),
 * the run is idempotent, and two runs at once are safe: the per-Case `SKIP LOCKED` lock means
 * each Case is purged by exactly one of them.
 */
export function purgeExpiredCasesEffect(opts?: {
  limit?: number;
}): Effect.Effect<PurgeRunSummary, DomainTag, Db | BlobStore> {
  return Effect.gen(function* purgeExpiredCasesGen() {
    const now = yield* nowDateEffect;
    const due = yield* tryDbWith((exec) =>
      casesRepo.listDeletedPurgeDueIds(exec, {
        now,
        limit: opts?.limit ?? PURGE_BATCH,
      })
    );
    const summary: PurgeRunSummary = { purged: 0, failed: 0, skipped: 0 };
    for (const caseId of due) {
      const outcome = yield* purgeTombstonedCaseEffect(caseId, {});
      if (outcome.kind === "purged") summary.purged += 1;
      else if (outcome.kind === "failed") summary.failed += 1;
      else summary.skipped += 1;
    }
    return summary;
  });
}

/**
 * Erase every Case of an organization, live or deleted, before the organization itself goes
 * (`cases.organization_id` is a soft reference, so nothing cascades). Deleting an organization is
 * already an owner's decision, so each Case is tombstoned and purged at once (the deletion record
 * still names the owner). Stops at the first Case that cannot be purged.
 */
export function deleteOrganizationCasesEffect(
  organizationId: OrganizationId,
  opts?: { actorId?: string }
): Effect.Effect<number, DomainTag, Db | BlobStore> {
  return Effect.gen(function* deleteOrganizationCasesGen() {
    const ids = yield* tryDbWith((exec) =>
      casesRepo.listIdsIncludingDeleted(exec, organizationId)
    );
    const actor: CaseActor =
      opts?.actorId === undefined ? {} : { actorId: opts.actorId };
    for (const caseId of ids) {
      const now = yield* nowDateEffect;
      yield* transact((tx) =>
        Effect.gen(function* tombstoneForOrganizationTx() {
          const locked = yield* tryDb(() =>
            casesRepo.getByIdIncludingDeleted(tx, caseId, organizationId, {
              lock: "update",
            })
          );
          if (locked !== null && locked.deletedAt === null) {
            // The cancel's `afterCommit` is not run: this process (the web server, no queue)
            // has no Job fibers, and the purge below erases the Case's Jobs and Playbook runs.
            yield* tombstoneInTx(tx, locked, actor, now, now);
          }
        })
      );
      const outcome = yield* purgeTombstonedCaseEffect(caseId, actor);
      if (outcome.kind === "failed") {
        return yield* new InternalError({
          reason: `Failed to purge Case ${caseId}: ${outcome.reason}`,
        });
      }
    }
    return ids.length;
  });
}
