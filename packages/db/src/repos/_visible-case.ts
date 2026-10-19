import { isNotNull, isNull } from "drizzle-orm";

import { cases } from "../schema/cases";

/**
 * The one "visible Case" predicate (#304): a Case that is not tombstoned. Every read of `cases`
 * (and every join to it that decides whether a caller may see Case data) takes it, so a deleted
 * Case is invisible to a caller exactly like another organization's Case.
 *
 * Naming scheme for the methods of `casesRepo` that look past it: `*IncludingDeleted` reads a
 * Case in either state, `*Deleted*` touches tombstones only (and takes {@link tombstonedCase}).
 * A method whose name has neither (`list`, `getById`, `update`, `tombstone`) sees visible Cases only.
 */
export const visibleCase = isNull(cases.deletedAt);

/** The twin of {@link visibleCase}: a tombstoned Case. */
export const tombstonedCase = isNotNull(cases.deletedAt);
