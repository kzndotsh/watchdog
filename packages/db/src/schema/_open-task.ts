import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { OPEN_TASK_STATUSES } from "@watchdog/schemas/shared";

import { sqlLiteral } from "./_vocab";

/**
 * `status IN ('backlog', 'in_progress', 'blocked')` with the values written as literals, never
 * parameters: the partial index `tasks_case_open_due_idx` carries this exact predicate, and the
 * planner can use a partial index only when the query's condition is the same text (a parameter
 * would leave a generic plan unable to prove it). The due-Tasks read (`tasksRepo.listDue`,
 * `countDue`) and the index both take it from here.
 */
export function openTaskStatus(status: AnyPgColumn): SQL {
  return sql`${status} in (${sql.raw(OPEN_TASK_STATUSES.map(sqlLiteral).join(", "))})`;
}
