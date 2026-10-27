import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  lte,
  or,
} from "drizzle-orm";

import type { CaseId, OrganizationId } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { cases } from "../schema/cases";
import { entitySlugIlikePatterns } from "./_ilike";
import { clampSearchLimit } from "./_limits";
import { trimCaseId } from "./_scoped-ids";
import { slugForLookup } from "./_slug-lookup";
import { tombstonedCase, visibleCase } from "./_visible-case";

export const caseColumns = {
  id: cases.id,
  name: cases.name,
  slug: cases.slug,
  description: cases.description,
  organizationId: cases.organizationId,
  allowedEgress: cases.allowedEgress,
} as const;

export type CaseRow = {
  [K in keyof typeof caseColumns]: (typeof cases.$inferSelect)[K &
    keyof typeof cases.$inferSelect];
};

/** A Case with its tombstone state: live (`deletedAt` null) or deleted. */
export type CaseLifecycleRow = CaseRow & {
  deletedAt: Date | null;
  deletedBy: string | null;
  purgeStartedAt: Date | null;
  purgeError: string | null;
  /** When the scheduled purge takes it (fixed at delete time); null while live. */
  purgeAfter: Date | null;
};

/** A tombstoned Case as owners and admins see it in Deleted Cases (the only reader past `visibleCase`). */
export type DeletedCaseRow = CaseLifecycleRow & { deletedAt: Date };

/** Narrows a lifecycle row (or a list row over one) to a tombstone. */
export function isDeletedRow<R extends CaseLifecycleRow>(
  row: R
): row is R & { deletedAt: Date } {
  return row.deletedAt !== null;
}

export const lifecycleColumns = {
  ...caseColumns,
  deletedAt: cases.deletedAt,
  deletedBy: cases.deletedBy,
  purgeStartedAt: cases.purgeStartedAt,
  purgeError: cases.purgeError,
  purgeAfter: cases.purgeAfter,
} as const;

export type NewCase = Pick<
  typeof cases.$inferInsert,
  "name" | "slug" | "description" | "organizationId"
>;

export type CasePatch = Partial<
  Pick<
    typeof cases.$inferInsert,
    "name" | "slug" | "description" | "allowedEgress"
  >
>;

function inOrg(organizationId: OrganizationId) {
  return eq(cases.organizationId, organizationId);
}

export const casesRepo = {
  /**
   * Every visible Case of the organization by name. Not a list screen's read (that is
   * `caseListRepo`, a page at a time): the Active-Case rule and the shell need the whole set.
   */
  async list(exec: DbExec, organizationId: OrganizationId): Promise<CaseRow[]> {
    return exec
      .select(caseColumns)
      .from(cases)
      .where(and(inOrg(organizationId), visibleCase))
      .orderBy(asc(cases.name), asc(cases.id));
  },

  async listIds(
    exec: DbExec,
    organizationId: OrganizationId
  ): Promise<CaseId[]> {
    const rows = await exec
      .select({ id: cases.id })
      .from(cases)
      .where(and(inOrg(organizationId), visibleCase));
    return rows.map((row) => row.id);
  },

  /** Every Case id of an organization, live and deleted (organization delete erases them all). */
  async listIdsIncludingDeleted(
    exec: DbExec,
    organizationId: OrganizationId
  ): Promise<CaseId[]> {
    const rows = await exec
      .select({ id: cases.id })
      .from(cases)
      .where(inOrg(organizationId));
    return rows.map((row) => row.id);
  },

  /**
   * Every Case id in the database, across organizations. Worker internals only
   * (the export consumer's full re-scan after a resync); never an HTTP path.
   */
  async listAllIdsUnchecked(exec: DbExec): Promise<CaseId[]> {
    const rows = await exec
      .select({ id: cases.id })
      .from(cases)
      .where(visibleCase);
    return rows.map((row) => row.id);
  },

  async search(
    exec: DbExec,
    organizationId: OrganizationId,
    term: string,
    limit: number
  ): Promise<CaseRow[]> {
    const safeLimit = clampSearchLimit(limit);
    const slugPatterns = entitySlugIlikePatterns(term);
    if (slugPatterns.length === 0) return [];
    const pattern = slugPatterns[0];
    const slugMatches = slugPatterns.map((p) => ilike(cases.slug, p));
    return exec
      .select(caseColumns)
      .from(cases)
      .where(
        and(
          inOrg(organizationId),
          visibleCase,
          or(
            ilike(cases.name, pattern),
            ...slugMatches,
            ilike(cases.description, pattern)
          )
        )
      )
      .orderBy(asc(cases.name))
      .limit(safeLimit);
  },

  async getById(
    exec: DbExec,
    id: CaseId,
    organizationId: OrganizationId
  ): Promise<CaseRow | null> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return null;
    const [row] = await exec
      .select(caseColumns)
      .from(cases)
      .where(and(eq(cases.id, scopedId), inOrg(organizationId), visibleCase))
      .limit(1);
    return row ?? null;
  },

  /** Worker / export internals: case id already came from a trusted job or child row. */
  async getByIdUnchecked(exec: DbExec, id: CaseId): Promise<CaseRow | null> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return null;
    const [row] = await exec
      .select(caseColumns)
      .from(cases)
      .where(and(eq(cases.id, scopedId), visibleCase))
      .limit(1);
    return row ?? null;
  },

  /** Serialize proposal ingress for a Case (suppress + insert). */
  async lockById(exec: DbExec, id: CaseId): Promise<CaseRow | null> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return null;
    const [row] = await exec
      .select(caseColumns)
      .from(cases)
      .where(and(eq(cases.id, scopedId), visibleCase))
      .limit(1)
      .for("update");
    return row ?? null;
  },

  async getBySlug(
    exec: DbExec,
    slug: string,
    organizationId: OrganizationId
  ): Promise<CaseRow | null> {
    const scopedSlug = slugForLookup(slug);
    if (scopedSlug === undefined) return null;
    const [row] = await exec
      .select(caseColumns)
      .from(cases)
      .where(
        and(eq(cases.slug, scopedSlug), inOrg(organizationId), visibleCase)
      )
      .limit(1);
    return row ?? null;
  },

  async create(exec: DbExec, values: NewCase): Promise<CaseRow | null> {
    const [created] = await exec
      .insert(cases)
      .values(values)
      .returning(caseColumns);
    return created ?? null;
  },

  async update(
    exec: DbExec,
    id: CaseId,
    organizationId: OrganizationId,
    patch: CasePatch
  ): Promise<CaseRow | null> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return null;
    const [updated] = await exec
      .update(cases)
      .set(patch)
      .where(and(eq(cases.id, scopedId), inOrg(organizationId), visibleCase))
      .returning(caseColumns);
    return updated ?? null;
  },

  /**
   * Tombstone a visible Case (the soft delete). Null when it is missing, foreign or already
   * deleted. The caller writes the `deleted` record first and cancels the Case's work in the same
   * transaction (the database refuses the change without the record).
   */
  async tombstone(
    exec: DbExec,
    id: CaseId,
    organizationId: OrganizationId,
    values: { deletedAt: Date; deletedBy: string | null; purgeAfter: Date }
  ): Promise<CaseRow | null> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return null;
    const [row] = await exec
      .update(cases)
      .set({
        deletedAt: values.deletedAt,
        deletedBy: values.deletedBy,
        purgeAfter: values.purgeAfter,
        purgeStartedAt: null,
        purgeError: null,
      })
      .where(and(eq(cases.id, scopedId), inOrg(organizationId), visibleCase))
      .returning(caseColumns);
    return row ?? null;
  },

  /**
   * Clear a tombstone, optionally under a new slug (the old one was taken meanwhile). Null when
   * the Case is not deleted, is foreign, or a purge has begun (its files may be partly erased, so
   * it can only be purged now). The `restored` record comes first, in the same transaction.
   */
  async restoreDeleted(
    exec: DbExec,
    id: CaseId,
    organizationId: OrganizationId,
    values?: { slug?: string }
  ): Promise<CaseRow | null> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return null;
    const [row] = await exec
      .update(cases)
      .set({
        deletedAt: null,
        deletedBy: null,
        purgeAfter: null,
        purgeError: null,
        ...(values?.slug === undefined ? {} : { slug: values.slug }),
      })
      .where(
        and(
          eq(cases.id, scopedId),
          inOrg(organizationId),
          tombstonedCase,
          isNull(cases.purgeStartedAt)
        )
      )
      .returning(caseColumns);
    return row ?? null;
  },

  /**
   * The tombstoned Case of the organization a slug names (the deleted-Case screen), or null.
   * Several deleted Cases may have held the slug over time: the newest deletion wins.
   */
  async getDeletedBySlug(
    exec: DbExec,
    slug: string,
    organizationId: OrganizationId
  ): Promise<DeletedCaseRow | null> {
    const scopedSlug = slugForLookup(slug);
    if (scopedSlug === undefined) return null;
    const [row] = await exec
      .select(lifecycleColumns)
      .from(cases)
      .where(
        and(eq(cases.slug, scopedSlug), inOrg(organizationId), tombstonedCase)
      )
      .orderBy(desc(cases.deletedAt), desc(cases.id))
      .limit(1);
    return row !== undefined && isDeletedRow(row) ? row : null;
  },

  /**
   * A Case of the organization in either state. `lock` takes a row lock for a delete, restore or
   * purge decision (`"update"`), or waits out whoever holds one (`"share"`: the row is read after
   * their transaction ended).
   */
  async getByIdIncludingDeleted(
    exec: DbExec,
    id: CaseId,
    organizationId: OrganizationId,
    opts?: { lock?: "update" | "share" }
  ): Promise<CaseLifecycleRow | null> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return null;
    const query = exec
      .select(lifecycleColumns)
      .from(cases)
      .where(and(eq(cases.id, scopedId), inOrg(organizationId)))
      .limit(1);
    const [row] =
      opts?.lock === undefined ? await query : await query.for(opts.lock);
    return row ?? null;
  },

  /**
   * Tombstones the scheduled purge should work on: past their `purge_after`, or a purge that began
   * and did not finish. Oldest first, but Cases whose last purge failed come after the rest, so a
   * few that keep failing cannot hold up every later Case. Each is then locked with
   * `lockDeletedForPurge`.
   */
  async listDeletedPurgeDueIds(
    exec: DbExec,
    opts: { now: Date; limit: number }
  ): Promise<CaseId[]> {
    const limit = Math.max(1, Math.trunc(opts.limit));
    const due = and(
      tombstonedCase,
      or(lte(cases.purgeAfter, opts.now), isNotNull(cases.purgeStartedAt))
    );
    const fresh = await exec
      .select({ id: cases.id })
      .from(cases)
      .where(and(due, isNull(cases.purgeError)))
      .orderBy(asc(cases.deletedAt), asc(cases.id))
      .limit(limit);
    if (fresh.length >= limit) return fresh.map((row) => row.id);
    const failed = await exec
      .select({ id: cases.id })
      .from(cases)
      .where(and(due, isNotNull(cases.purgeError)))
      .orderBy(asc(cases.deletedAt), asc(cases.id))
      .limit(limit - fresh.length);
    return [...fresh, ...failed].map((row) => row.id);
  },

  /**
   * Lock one tombstoned Case for a purge, skipping a row another purge holds (`SKIP LOCKED`), so
   * two purges never work on the same Case and the second one moves on. Null when the Case is
   * gone, restored, or locked elsewhere.
   */
  async lockDeletedForPurge(
    exec: DbExec,
    id: CaseId
  ): Promise<DeletedCaseRow | null> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return null;
    const [row] = await exec
      .select(lifecycleColumns)
      .from(cases)
      .where(and(eq(cases.id, scopedId), tombstonedCase))
      .limit(1)
      .for("update", { skipLocked: true });
    return row !== undefined && isDeletedRow(row) ? row : null;
  },

  /**
   * Mark a deleted Case's purge begun (a restore is refused from then on). Only the first start
   * counts: a retry leaves the mark alone. The `purge_started` record comes first.
   */
  async markDeletedPurgeStarted(
    exec: DbExec,
    id: CaseId,
    startedAt: Date
  ): Promise<boolean> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return false;
    const rows = await exec
      .update(cases)
      .set({ purgeStartedAt: startedAt })
      .where(
        and(
          eq(cases.id, scopedId),
          tombstonedCase,
          isNull(cases.purgeStartedAt)
        )
      )
      .returning({ id: cases.id });
    return rows.length > 0;
  },

  /**
   * Remember why a deleted Case's last purge attempt failed (Deleted Cases shows it; the next run
   * retries). The `purge_failed` record comes first.
   */
  async recordDeletedPurgeError(
    exec: DbExec,
    id: CaseId,
    message: string
  ): Promise<void> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return;
    await exec
      .update(cases)
      .set({ purgeError: message })
      .where(and(eq(cases.id, scopedId), tombstonedCase));
  },

  /**
   * Hard-delete a tombstoned Case; the foreign keys cascade through the Graph, its history,
   * Evidence, Jobs and the activity log. Only a tombstone is deletable, and the database refuses
   * the delete of any Case without the `purged` record in the same transaction. The caller sets
   * the `system` history context first (#352).
   */
  async purgeDeleted(exec: DbExec, id: CaseId): Promise<CaseRow | null> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return null;
    const [deleted] = await exec
      .delete(cases)
      .where(and(eq(cases.id, scopedId), tombstonedCase))
      .returning(caseColumns);
    return deleted ?? null;
  },
};
