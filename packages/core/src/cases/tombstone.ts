import { Effect } from "effect";

import {
  casesRepo,
  jobsRepo,
  playbookRunsRepo,
  type CaseLifecycleRow,
  type DbExec,
  type DeletedCaseRow,
} from "@watchdog/db";
import { DELETED_CASES_PAGE_MAX } from "@watchdog/schemas/cases";
import {
  parseTrimmedCaseId,
  type CaseId,
  type OrganizationId,
} from "@watchdog/schemas/shared";

import { optionalActorId } from "../actors/require-actor-id";
import { loadActorUsersEffect } from "../actors/resolve-actor-labels";
import {
  assertCaseInOrgEffect,
  requireTrimmedCaseIdEffect,
} from "../graph/patch/guards";
import { nowDateEffect } from "../infra/clock";
import type { Db } from "../infra/db-service";
import { errorMessage } from "../infra/error-utils";
import {
  removeCaseExportDirEffect,
  scheduleCaseExportEffect,
} from "../infra/export-sync";
import { tryDb, tryDbWith, requireWritten } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import { logProcess, logSwallowed } from "../infra/process-log";
import {
  boundEchoedId,
  ConflictError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { appendJobActivityEffect } from "../jobs/job-activity";
import {
  isOrganizationManagerEffect,
  requireOrganizationManagerEffect,
} from "../organization/roles";
import { toRecord, type CaseRecord } from "./case-record";
import { recordDeletionEventEffect } from "./deletion-event";
import { caseRetentionDays, daysUntilPurge, purgeDueAt } from "./retention";

/**
 * Who a tombstone, restore or purge is attributed to: the user (an API key's user) and the
 * key's `api-key:...` snapshot. No actor is the scheduled purge, recorded as `system`.
 */
export type CaseActor = {
  actorId?: string;
  actorLabel?: string;
  /** The API key (`apikey.id`); recorded on the Case activity entry. */
  actorKeyId?: string;
};

const MAX_PURGE_ERROR_CHARS = 300;
const DELETED_PAGE_DEFAULT = 25;

export const MANAGE_REASON =
  "Only an owner or admin can delete, restore or purge a Case";

/** A tombstoned Case as Deleted Cases lists it: what was deleted, by whom, and when it goes for good. */
export type DeletedCaseRecord = {
  id: CaseId;
  name: string;
  slug: string;
  description: string | null;
  /** ISO timestamp. */
  deletedAt: string;
  deletedById: string | null;
  /** Display name of `deletedById`; null when unknown or the user is gone. */
  deletedByName: string | null;
  /** ISO timestamp after which the scheduled purge takes the Case. */
  purgeAt: string;
  /** Whole days left to restore it; 0 once the window has passed. */
  daysLeft: number;
  /** A purge has begun (a restore is refused; it can only be purged). */
  purging: boolean;
  /** The last purge attempt's failure, when one failed and will be retried. */
  purgeError: string | null;
};

export type DeletedCasesPage = {
  items: DeletedCaseRecord[];
  /** Pass as `cursor` for the next page; null on the last page. */
  nextCursor: string | null;
};

export type DeletionPolicy = {
  /** Days a deleted Case stays restorable (`WD_CASE_RETENTION_DAYS`) for a Case deleted now. */
  restoreWindowDays: number;
  /** The caller is an owner or admin: they may delete, restore and purge Cases. */
  canManage: boolean;
  /** With a `caseId`: queued, running and blocked Jobs a delete would cancel (0 for a non-manager). */
  cancellableJobs: number;
};

/**
 * What the delete confirmation and the Cases list need: the configured restore window, whether
 * this caller may delete, restore and purge (the same check the server enforces, so the UI hides
 * what the server would refuse) and, for one Case, how many Jobs a delete would cancel. A Case
 * the caller cannot see is `not_found`.
 */
export function getDeletionPolicyEffect(opts: {
  organizationId: OrganizationId;
  actorId?: string;
  caseId?: CaseId;
}): Effect.Effect<DeletionPolicy, DomainTag, Db> {
  return Effect.gen(function* getDeletionPolicyGen() {
    const scopedCaseId =
      opts.caseId === undefined
        ? undefined
        : yield* assertCaseInOrgEffect(opts.caseId, opts.organizationId);
    const canManage = yield* isOrganizationManagerEffect({
      organizationId: opts.organizationId,
      actorId: optionalActorId(opts.actorId),
    });
    const cancellableJobs =
      scopedCaseId === undefined || !canManage
        ? 0
        : yield* tryDbWith((exec) =>
            jobsRepo.countCancellableForCase(exec, scopedCaseId)
          );
    return {
      restoreWindowDays: caseRetentionDays(),
      canManage,
      cancellableJobs,
    };
  });
}

/** The date the scheduled purge takes a deleted Case: the one fixed at delete time. */
function purgeAfterOf(row: { deletedAt: Date; purgeAfter: Date | null }): Date {
  return row.purgeAfter ?? purgeDueAt(row.deletedAt, caseRetentionDays());
}

export function boundedMessage(error: unknown): string {
  return errorMessage(error).slice(0, MAX_PURGE_ERROR_CHARS);
}

function toDeletedRecord(
  row: DeletedCaseRow,
  names: ReadonlyMap<string, { name: string }>,
  now: Date
): DeletedCaseRecord {
  const purgeAfter = purgeAfterOf(row);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    deletedAt: row.deletedAt.toISOString(),
    deletedById: row.deletedBy,
    deletedByName:
      row.deletedBy === null ? null : (names.get(row.deletedBy)?.name ?? null),
    purgeAt: purgeAfter.toISOString(),
    daysLeft: daysUntilPurge(purgeAfter, now),
    purging: row.purgeStartedAt !== null,
    purgeError: row.purgeError,
  };
}

const CURSOR_PATTERN = /^(\d{1,16})_([0-9a-f-]{36})$/;

function encodeCursor(row: DeletedCaseRow): string {
  return `${row.deletedAt.getTime()}_${row.id}`;
}

function parseCursor(raw: string): { deletedAt: Date; id: CaseId } | null {
  const match = CURSOR_PATTERN.exec(raw);
  const id = parseTrimmedCaseId(match?.[2] ?? "");
  if (match === null || id === null) return null;
  const deletedAt = new Date(Number(match[1]));
  return Number.isNaN(deletedAt.getTime()) ? null : { deletedAt, id };
}

/**
 * Deleted Cases of the organization, newest deletion first, for owners and admins (anyone else is
 * `forbidden`: the list names Cases a member can no longer see).
 */
export function listDeletedCasesEffect(opts: {
  organizationId: OrganizationId;
  actorId?: string;
  cursor?: string;
  limit?: number;
}): Effect.Effect<DeletedCasesPage, DomainTag, Db> {
  return Effect.gen(function* listDeletedCasesGen() {
    yield* requireOrganizationManagerEffect({
      organizationId: opts.organizationId,
      actorId: opts.actorId,
      reason: MANAGE_REASON,
    });
    const limit = Math.min(
      Math.max(1, Math.trunc(opts.limit ?? DELETED_PAGE_DEFAULT)),
      DELETED_CASES_PAGE_MAX
    );
    let after: { deletedAt: Date; id: CaseId } | undefined;
    if (opts.cursor !== undefined) {
      const parsed = parseCursor(opts.cursor);
      if (parsed === null) {
        return yield* new InvalidError({ reason: "Invalid cursor" });
      }
      after = parsed;
    }
    const rows = yield* tryDbWith((exec) =>
      casesRepo.listDeletedPage(exec, opts.organizationId, {
        limit: limit + 1,
        ...(after === undefined ? {} : { after }),
      })
    );
    const page = rows.slice(0, limit);
    const names = yield* loadActorUsersEffect(page.map((row) => row.deletedBy));
    const now = yield* nowDateEffect;
    const last = page.at(-1);
    return {
      items: page.map((row) => toDeletedRecord(row, names, now)),
      nextCursor:
        rows.length > limit && last !== undefined ? encodeCursor(last) : null,
    };
  });
}

/**
 * The tombstoned Case a Case URL names, for owners and admins (the "deleted on X by Y" screen).
 * A live Case, a foreign one, a missing one and a caller who may not manage the organization are
 * all `not_found`: the screen never confirms that a deleted Case exists to anyone else.
 */
export function getDeletedCaseBySlugEffect(opts: {
  slug: string;
  organizationId: OrganizationId;
  actorId?: string;
}): Effect.Effect<DeletedCaseRecord, DomainTag, Db> {
  return Effect.gen(function* getDeletedCaseBySlugGen() {
    const notFound = new NotFoundError({
      entity: "Case",
      id: boundEchoedId(opts.slug),
    });
    const allowed = yield* requireOrganizationManagerEffect({
      organizationId: opts.organizationId,
      actorId: opts.actorId,
      reason: MANAGE_REASON,
    }).pipe(
      Effect.as(true),
      Effect.catchTag("ForbiddenError", () => Effect.succeed(false))
    );
    if (!allowed) return yield* notFound;
    const row = yield* tryDbWith((exec) =>
      casesRepo.getDeletedBySlug(exec, opts.slug, opts.organizationId)
    );
    if (row === null) return yield* notFound;
    const names = yield* loadActorUsersEffect([row.deletedBy]);
    const now = yield* nowDateEffect;
    return toDeletedRecord(row, names, now);
  });
}

/**
 * Tombstone a Case in the caller's transaction: the `deleted` record and activity entry first (the
 * database refuses the change without the record), then the Case's queued and running work is
 * cancelled through the existing cancel path and the Case is marked deleted, to be purged after
 * `purgeAfter`.
 */
export function tombstoneInTx(
  tx: DbExec,
  row: CaseLifecycleRow,
  actor: CaseActor,
  now: Date,
  purgeAfter: Date
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* tombstoneInTxGen() {
    const actorId = optionalActorId(actor.actorId);
    yield* recordDeletionEventEffect(tx, row, "deleted", {
      actorId: actorId ?? null,
      actorLabel: actor.actorLabel ?? null,
      actorKeyId: actor.actorKeyId ?? null,
    });
    // The existing cancel path: status `cancelled`, which the worker's cancel poll turns into an
    // abort for a running Job, and a `cancelled` activity entry per Job.
    const cancelled = yield* tryDb(() =>
      jobsRepo.cancelAllCancellableForCase(tx, row.id, now)
    );
    yield* Effect.forEach(
      cancelled,
      (job) => appendJobActivityEffect(tx, job, "cancelled"),
      { concurrency: 1 }
    );
    yield* tryDb(() => playbookRunsRepo.cancelRunningForCase(tx, row.id, now));
    yield* tryDb(() =>
      casesRepo.tombstone(tx, row.id, row.organizationId, {
        deletedAt: now,
        deletedBy: actorId ?? null,
        purgeAfter,
      })
    ).pipe(requireWritten("delete Case"));
  });
}

/**
 * Delete a Case: a tombstone, not an erase (#304). The Case, its Graph, Evidence and files stay
 * until it is restored (owner or admin, inside the window) or purged; every read skips it from
 * the moment this commits. Queued and running Jobs are cancelled and the deletion is recorded
 * with its actor in the same transaction. Only an owner or admin may delete (an API key acts as
 * its user). A foreign, missing or already deleted Case is `not_found`.
 */
export function deleteCaseEffect(
  id: CaseId,
  opts: CaseActor & { organizationId: OrganizationId }
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* deleteCaseGen() {
    // Role first, then the Case (one order for delete, restore and purge): a caller who may not
    // manage Cases learns nothing about any Case, whichever id they send.
    yield* requireOrganizationManagerEffect({
      organizationId: opts.organizationId,
      actorId: optionalActorId(opts.actorId),
      reason: MANAGE_REASON,
    });
    const caseId = yield* requireTrimmedCaseIdEffect(id);
    const existing = yield* tryDbWith((exec) =>
      casesRepo.getById(exec, caseId, opts.organizationId)
    );
    if (!existing) {
      return yield* new NotFoundError({ entity: "Case", id: caseId });
    }
    const now = yield* nowDateEffect;
    // The window is the deleting process's policy, fixed on the row: a later change of the
    // setting does not move the date of a Case that is already deleted.
    const purgeAfter = purgeDueAt(now, caseRetentionDays());
    yield* transact((tx) =>
      Effect.gen(function* deleteCaseTx() {
        const locked = yield* tryDb(() =>
          casesRepo.getByIdIncludingDeleted(tx, caseId, opts.organizationId, {
            lock: "update",
          })
        );
        if (locked === null || locked.deletedAt !== null) {
          return yield* new NotFoundError({ entity: "Case", id: caseId });
        }
        yield* tombstoneInTx(tx, locked, opts, now, purgeAfter);
      })
    );
    const logActorId = optionalActorId(opts.actorId);
    if (logActorId) {
      logProcess("case.delete", "Case deleted (tombstoned)", {
        caseId,
        actorId: logActorId,
      });
    }
    // The Export shadow is a projection of a visible Case: drop it now, rebuilt on restore.
    yield* removeCaseExportDirEffect(opts.organizationId, existing.slug).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          logSwallowed("delete-case-export", error, { slug: existing.slug });
        })
      )
    );
  });
}

/** A restored Case; `previousSlug` is set when its old slug was taken meanwhile and it got a new one. */
export type RestoredCaseRecord = CaseRecord & { previousSlug: string | null };

const MAX_SLUG_ATTEMPTS = 50;

/** The first free slug of the organization: `base`, else `base-2`, `base-3`, ... */
function freeSlugEffect(
  tx: DbExec,
  organizationId: OrganizationId,
  base: string
): Effect.Effect<string, DomainTag> {
  return Effect.gen(function* freeSlugGen() {
    for (let n = 1; n <= MAX_SLUG_ATTEMPTS; n += 1) {
      const candidate = n === 1 ? base : `${base}-${n}`;
      const taken = yield* tryDb(() =>
        casesRepo.getBySlug(tx, candidate, organizationId)
      );
      if (taken === null) return candidate;
    }
    return yield* new ConflictError({
      reason:
        "Couldn't find a free link for this Case; rename another Case first",
    });
  });
}

/**
 * Restore a deleted Case inside its window (owner or admin). A Case that is not deleted or not
 * in the organization is `not_found`; one past the window, or whose purge has begun, is a
 * `conflict` (its files may be partly erased, so it can only be purged now).
 */
export function restoreCaseEffect(
  id: CaseId,
  opts: CaseActor & { organizationId: OrganizationId }
): Effect.Effect<RestoredCaseRecord, DomainTag, Db> {
  return Effect.gen(function* restoreCaseGen() {
    yield* requireOrganizationManagerEffect({
      organizationId: opts.organizationId,
      actorId: optionalActorId(opts.actorId),
      reason: MANAGE_REASON,
    });
    const caseId = yield* requireTrimmedCaseIdEffect(id);
    const now = yield* nowDateEffect;
    const restored = yield* transact((tx) =>
      Effect.gen(function* restoreCaseTx() {
        const locked = yield* tryDb(() =>
          casesRepo.getByIdIncludingDeleted(tx, caseId, opts.organizationId, {
            lock: "update",
          })
        );
        if (locked === null || locked.deletedAt === null) {
          return yield* new NotFoundError({ entity: "Case", id: caseId });
        }
        if (locked.purgeStartedAt !== null) {
          return yield* new ConflictError({
            reason:
              "This Case is being purged and can no longer be restored; purge it to finish",
          });
        }
        if (
          purgeAfterOf({
            deletedAt: locked.deletedAt,
            purgeAfter: locked.purgeAfter,
          }) <= now
        ) {
          return yield* new ConflictError({
            reason:
              "The restore window for this Case has ended; it is purged at the next run",
          });
        }
        // A new Case may have taken the slug while this one was deleted: restore under the
        // first free one and say so.
        const slug = yield* freeSlugEffect(
          tx,
          opts.organizationId,
          locked.slug
        );
        const actorId = optionalActorId(opts.actorId);
        yield* recordDeletionEventEffect(tx, { ...locked, slug }, "restored", {
          actorId: actorId ?? null,
          actorLabel: opts.actorLabel ?? null,
          actorKeyId: opts.actorKeyId ?? null,
        });
        const row = yield* tryDb(
          () =>
            casesRepo.restoreDeleted(
              tx,
              caseId,
              opts.organizationId,
              slug === locked.slug ? {} : { slug }
            ),
          {
            uniqueIndex: "cases_organization_id_slug_uidx",
            conflictReason: "Its link was taken a moment ago; try again",
          }
        ).pipe(requireWritten("restore Case"));
        return {
          ...toRecord(row),
          previousSlug: slug === locked.slug ? null : locked.slug,
        };
      })
    );
    logProcess("case.restore", "Case restored", {
      caseId,
      ...(optionalActorId(opts.actorId) === undefined
        ? {}
        : { actorId: optionalActorId(opts.actorId) }),
    });
    // Rebuild the Export shadow that the delete dropped.
    yield* scheduleCaseExportEffect(caseId).pipe(
      Effect.forkDetach({ startImmediately: true })
    );
    return restored;
  });
}
