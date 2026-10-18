import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  lt,
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
import { visibleCase } from "./_visible-case";

export const caseColumns = {
  id: cases.id,
  name: cases.name,
  slug: cases.slug,
  description: cases.description,
  organizationId: cases.organizationId,
  allowThirdPartyEgress: cases.allowThirdPartyEgress,
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
};

/** A tombstoned Case as owners and admins see it in Deleted Cases (the only reader past `visibleCase`). */
export type DeletedCaseRow = CaseLifecycleRow & { deletedAt: Date };

function isDeletedRow(row: CaseLifecycleRow): row is DeletedCaseRow {
  return row.deletedAt !== null;
}

const lifecycleColumns = {
  ...caseColumns,
  deletedAt: cases.deletedAt,
  deletedBy: cases.deletedBy,
  purgeStartedAt: cases.purgeStartedAt,
  purgeError: cases.purgeError,
} as const;

/** Keyset cursor of the Deleted Cases list: newest deletion first, ties by id. */
export type DeletedCaseCursor = { deletedAt: Date; id: CaseId };

export type NewCase = Pick<
  typeof cases.$inferInsert,
  "name" | "slug" | "description" | "organizationId"
>;

export type CasePatch = Partial<
  Pick<
    typeof cases.$inferInsert,
    "name" | "slug" | "description" | "allowThirdPartyEgress"
  >
>;

function inOrg(organizationId: OrganizationId) {
  return eq(cases.organizationId, organizationId);
}

export const casesRepo = {
  async list(exec: DbExec, organizationId: OrganizationId): Promise<CaseRow[]> {
    return exec
      .select(caseColumns)
      .from(cases)
      .where(and(inOrg(organizationId), visibleCase))
      .orderBy(asc(cases.name));
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
   * Tombstone a live Case (the soft delete). Null when it is missing, foreign or already
   * deleted. The caller writes the deletion record and cancels the Case's work in the same
   * transaction.
   */
  async tombstone(
    exec: DbExec,
    id: CaseId,
    organizationId: OrganizationId,
    values: { deletedAt: Date; deletedBy: string | null }
  ): Promise<CaseRow | null> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return null;
    const [row] = await exec
      .update(cases)
      .set({
        deletedAt: values.deletedAt,
        deletedBy: values.deletedBy,
        purgeStartedAt: null,
        purgeError: null,
      })
      .where(and(eq(cases.id, scopedId), inOrg(organizationId), visibleCase))
      .returning(caseColumns);
    return row ?? null;
  },

  /**
   * Clear a tombstone. Null when the Case is not deleted, is foreign, or a purge has begun (its
   * files may be partly erased, so it can only be purged now).
   */
  async restore(
    exec: DbExec,
    id: CaseId,
    organizationId: OrganizationId
  ): Promise<CaseRow | null> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return null;
    const [row] = await exec
      .update(cases)
      .set({ deletedAt: null, deletedBy: null, purgeError: null })
      .where(
        and(
          eq(cases.id, scopedId),
          inOrg(organizationId),
          isNotNull(cases.deletedAt),
          isNull(cases.purgeStartedAt)
        )
      )
      .returning(caseColumns);
    return row ?? null;
  },

  /** Tombstoned Cases of an organization, newest deletion first (Deleted Cases). */
  async listDeletedPage(
    exec: DbExec,
    organizationId: OrganizationId,
    opts: { limit: number; after?: DeletedCaseCursor }
  ): Promise<DeletedCaseRow[]> {
    const after = opts.after;
    const rows = await exec
      .select(lifecycleColumns)
      .from(cases)
      .where(
        and(
          inOrg(organizationId),
          isNotNull(cases.deletedAt),
          after === undefined
            ? undefined
            : or(
                lt(cases.deletedAt, after.deletedAt),
                and(
                  eq(cases.deletedAt, after.deletedAt),
                  lt(cases.id, after.id)
                )
              )
        )
      )
      .orderBy(desc(cases.deletedAt), desc(cases.id))
      .limit(Math.max(1, Math.trunc(opts.limit)));
    return rows.filter(isDeletedRow);
  },

  /** One tombstoned Case of the organization by slug (the deleted-Case screen), or null. */
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
        and(
          eq(cases.slug, scopedSlug),
          inOrg(organizationId),
          isNotNull(cases.deletedAt)
        )
      )
      .limit(1);
    return row !== undefined && isDeletedRow(row) ? row : null;
  },

  /** A Case of the organization, live or tombstoned, locked for a delete, restore or purge decision. */
  async lockByIdIncludingDeleted(
    exec: DbExec,
    id: CaseId,
    organizationId: OrganizationId
  ): Promise<CaseLifecycleRow | null> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return null;
    const [row] = await exec
      .select(lifecycleColumns)
      .from(cases)
      .where(and(eq(cases.id, scopedId), inOrg(organizationId)))
      .limit(1)
      .for("update");
    return row ?? null;
  },

  /**
   * Tombstones the scheduled purge should work on: past the restore window (`deletedBefore`), or
   * a purge that began and did not finish. Oldest first; each is then locked with
   * `lockDeletedForPurge`.
   */
  async listPurgeDueIds(
    exec: DbExec,
    opts: { deletedBefore: Date; limit: number }
  ): Promise<CaseId[]> {
    const rows = await exec
      .select({ id: cases.id })
      .from(cases)
      .where(
        and(
          isNotNull(cases.deletedAt),
          or(
            lte(cases.deletedAt, opts.deletedBefore),
            isNotNull(cases.purgeStartedAt)
          )
        )
      )
      .orderBy(asc(cases.deletedAt), asc(cases.id))
      .limit(Math.max(1, Math.trunc(opts.limit)));
    return rows.map((row) => row.id);
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
      .where(and(eq(cases.id, scopedId), isNotNull(cases.deletedAt)))
      .limit(1)
      .for("update", { skipLocked: true });
    return row !== undefined && isDeletedRow(row) ? row : null;
  },

  /** Mark the purge begun (a restore is refused from then on) and clear the last error. */
  async markPurgeStarted(
    exec: DbExec,
    id: CaseId,
    startedAt: Date
  ): Promise<boolean> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return false;
    const rows = await exec
      .update(cases)
      .set({ purgeStartedAt: startedAt, purgeError: null })
      .where(and(eq(cases.id, scopedId), isNotNull(cases.deletedAt)))
      .returning({ id: cases.id });
    return rows.length > 0;
  },

  /** Remember why the last purge attempt failed (Deleted Cases shows it; the next run retries). */
  async recordPurgeError(
    exec: DbExec,
    id: CaseId,
    message: string
  ): Promise<void> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return;
    await exec
      .update(cases)
      .set({ purgeError: message })
      .where(and(eq(cases.id, scopedId), isNotNull(cases.deletedAt)));
  },

  /**
   * Hard-delete a tombstoned Case; the foreign keys cascade through the Graph, its history,
   * Evidence, Jobs and the activity log. Only a tombstone is deletable, so no live Case is ever
   * erased by one statement. The caller sets the `system` history context first (#352) and
   * writes the deletion record in the same transaction.
   */
  async purge(exec: DbExec, id: CaseId): Promise<CaseRow | null> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return null;
    const [deleted] = await exec
      .delete(cases)
      .where(and(eq(cases.id, scopedId), isNotNull(cases.deletedAt)))
      .returning(caseColumns);
    return deleted ?? null;
  },
};
