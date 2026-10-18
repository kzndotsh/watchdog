import { isNull } from "drizzle-orm";

import { cases } from "../schema/cases";

/**
 * The one "visible Case" predicate (#304): a Case that is not tombstoned. Every read of `cases`
 * (and every join to it that decides whether a caller may see Case data) takes it, so a deleted
 * Case is invisible to a caller exactly like another organization's Case. The Deleted Cases
 * methods of `casesRepo` are the only readers that look past it, and they say so in their names.
 */
export const visibleCase = isNull(cases.deletedAt);
