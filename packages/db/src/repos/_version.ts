import { and, type AnyColumn, eq, type SQL } from "drizzle-orm";
import type { PgTable, SelectedFields } from "drizzle-orm/pg-core";
import type { SelectResultFields } from "drizzle-orm/query-builders/select.types";

import type { CaseId } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { trimScopedCaseIds } from "./_scoped-ids";

/**
 * `version = $n` for an optimistic-concurrency UPDATE (#307), or nothing when the caller has no
 * version to check (a patch op that carries none, a system path). The check is part of the
 * statement's WHERE, so of two writers that read the same version exactly one matches a row.
 */
export function atVersion(
  versionColumn: AnyColumn,
  expectedVersion: number | undefined
): SQL | undefined {
  return expectedVersion === undefined
    ? undefined
    : eq(versionColumn, expectedVersion);
}

/**
 * The SET of a version-checked UPDATE. A patch with no column (an edit of the Evidence alone) still
 * has to run the statement so its WHERE checks the version and the trigger bumps it; `id = id` is
 * that no-op, and drizzle throws on an empty SET.
 */
export function setOrTouch<T extends object>(
  patch: T,
  id: string
): T | { id: string } {
  return Object.keys(patch).length === 0 ? { id } : patch;
}

/** What a Graph table gives {@link updateVersionedInCase}: where the row lives and what it returns. */
export type VersionedInCaseTable<
  T extends PgTable,
  C extends SelectedFields,
  P extends object,
> = {
  table: T;
  idColumn: AnyColumn;
  versionColumn: AnyColumn;
  /** The columns the UPDATE returns (the repo's row shape). */
  columns: C;
  /** The predicate that scopes the row to the Case (a Case column, or an EXISTS over its entity). */
  inCase: (caseId: CaseId) => SQL;
  /** Rewrites the patch before it is set; `null` refuses the update (a miss, like a bad id). */
  rewritePatch?: (patch: P) => P | null;
};

/**
 * The one version-checked UPDATE of a Graph row in its Case (#307, #665): the id, the Case scope
 * and the version check share one WHERE, so of two writers that read the same version exactly one
 * matches. Returns the row, or `null` for a bad id, a refused patch, a row outside the Case or a
 * stale version; core's graph mutation runner tells those apart. The version and `updated_at` are
 * set by the database triggers.
 */
export async function updateVersionedInCase<
  T extends PgTable,
  C extends SelectedFields,
  P extends object,
>(
  exec: DbExec,
  spec: VersionedInCaseTable<T, C, P>,
  caseId: CaseId,
  resourceId: string,
  patch: P,
  expectedVersion: number | undefined
): Promise<SelectResultFields<C> | null> {
  const scoped = trimScopedCaseIds(caseId, resourceId);
  if (!scoped) return null;
  const patchToSet = spec.rewritePatch ? spec.rewritePatch(patch) : patch;
  if (patchToSet === null) return null;
  const [updated] = await exec
    .update(spec.table)
    .set(setOrTouch(patchToSet, scoped.resourceId))
    .where(
      and(
        eq(spec.idColumn, scoped.resourceId),
        spec.inCase(scoped.caseId),
        atVersion(spec.versionColumn, expectedVersion)
      )
    )
    .returning(spec.columns);
  return updated ?? null;
}
