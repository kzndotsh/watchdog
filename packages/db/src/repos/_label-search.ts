import { inArray, sql, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm/column";

import { enumValuesMatchingDisplayLabel } from "@watchdog/schemas";

export function inArrayForDisplayLabelMatch<T extends string>(
  column: AnyColumn,
  values: readonly T[],
  labels: Record<T, string>,
  term: string
): SQL | undefined {
  const matched = enumValuesMatchingDisplayLabel(term, values, labels);
  return matched.length > 0 ? inArray(column, matched) : undefined;
}

/** Match dotted/slug catalog ids by humanized spacing (capability, playbook). */
export function sqlCatalogIdIlike(rawColumn: string, pattern: string): SQL {
  return sql`(
    ${sql.raw(rawColumn)} ilike ${pattern}
    or replace(replace(replace(${sql.raw(rawColumn)}, '.', ' '), '-', ' '), '_', ' ') ilike ${pattern}
  )`;
}

/** Raw-column `IN (...)` for display-label matches inside SQL subqueries. */
export function sqlInDisplayLabelMatch<T extends string>(
  rawColumn: string,
  values: readonly T[],
  labels: Record<T, string>,
  term: string
): SQL | undefined {
  const matched = enumValuesMatchingDisplayLabel(term, values, labels);
  if (matched.length === 0) return undefined;
  return sql`${sql.raw(rawColumn)} in (${sql.join(
    matched.map((value) => sql`${value}`),
    sql`, `
  )})`;
}
