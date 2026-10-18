import { getTableName, getTableUniqueName, sql } from "drizzle-orm";
import { check, type AnyPgColumn } from "drizzle-orm/pg-core";

/** One vocabulary column and the values its CHECK constraint admits. */
export type VocabCheck = {
  /** `public`, or `auth` for the Better Auth schema's own `auth_event`. */
  readonly schema: string;
  readonly table: string;
  readonly column: string;
  readonly constraint: string;
  readonly values: readonly string[];
};

const registered: VocabCheck[] = [];

/**
 * Every vocabulary CHECK the schema declares, in declaration order. Filled as the table modules
 * load, so read it after importing `./index` (the drift test and the violation report do).
 */
export const VOCAB_CHECKS: readonly VocabCheck[] = registered;

/** The constraint name for a vocabulary column: `<table>_<column>_vocab`. */
export function vocabConstraintName(table: string, column: string): string {
  return `${table}_${column}_vocab`;
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * A CHECK constraint that admits only `values`, for a column typed from the vocabulary module
 * (`text().$type<T>()`). The tuple is the one in `@watchdog/schemas`, so the database and the
 * schemas cannot drift: adding a value there changes the generated constraint, and
 * `pnpm check:migrations` fails until a migration carries the change. A nullable column keeps
 * NULL (`NULL IN (...)` is unknown, which a CHECK accepts). Use inside a table's constraints
 * callback: `vocabCheck(t.status, JOB_STATUSES)`.
 */
export function vocabCheck(column: AnyPgColumn, values: readonly string[]) {
  const table = getTableName(column.table);
  const constraint = vocabConstraintName(table, column.name);
  const schema = getTableUniqueName(column.table).split(".")[0] ?? "public";
  const entry = { schema, table, column: column.name, constraint, values };
  const existing = registered.findIndex((e) => e.constraint === constraint);
  if (existing === -1) registered.push(entry);
  else registered[existing] = entry;
  const list = sql.raw(values.map(sqlLiteral).join(", "));
  return check(constraint, sql`${column} IN (${list})`);
}
