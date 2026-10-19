import { type AnyColumn, eq, type SQL } from "drizzle-orm";

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
