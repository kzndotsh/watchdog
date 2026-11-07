import {
  CASE_LIFECYCLE_SQLSTATE,
  HISTORY_CONTEXT_MISSING_SQLSTATE,
} from "@watchdog/schemas/shared";

/** Extract a human-readable message from an unknown catch value. */
export function errorMessage(error: unknown, fallback?: string): string {
  if (error instanceof Error) return error.message;
  if (fallback !== undefined) return fallback;
  return String(error);
}

function unknownRecordMessage(
  error: unknown,
  record: { message?: unknown }
): string {
  if (error instanceof Error) return error.message;
  if (typeof record.message === "string") return record.message;
  return JSON.stringify(error);
}

function matchesUniqueViolation(error: unknown, indexName: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as {
    code?: unknown;
    constraint_name?: unknown;
    constraint?: unknown;
    message?: unknown;
  };
  if (record.code !== "23505") return false;

  const constraint =
    (typeof record.constraint_name === "string" && record.constraint_name) ||
    (typeof record.constraint === "string" && record.constraint) ||
    "";
  if (constraint.includes(indexName)) return true;

  return unknownRecordMessage(error, record).includes(indexName);
}

/**
 * Postgres unique violations use SQLSTATE 23505.
 * Pass the index/constraint name so unrelated violations still propagate.
 */
export function isUniqueViolation(error: unknown, indexName: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (matchesUniqueViolation(current, indexName)) return true;
    if (typeof current !== "object" || current === null) return false;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Whether `error`, or a `cause` below it, carries the Postgres SQLSTATE `code`. */
function hasSqlState(error: unknown, code: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    if ((current as { code?: unknown }).code === code) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * The database refused a Graph write because the transaction set no history context (migration
 * `graph_history_context_guard`): a write path forgot `setHistoryContextEffect`. Reads the SQLSTATE
 * through the driver and drizzle `cause` chain.
 */
export function isHistoryContextMissing(error: unknown): boolean {
  return hasSqlState(error, HISTORY_CONTEXT_MISSING_SQLSTATE);
}

/**
 * The database refused a Case change that has no deletion record in its transaction (migration
 * `case_lifecycle_guard`, SQLSTATE WD002): a write path skipped `recordDeletionEventEffect`, or
 * tried to purge a live Case.
 */
export function isCaseLifecycleViolation(error: unknown): boolean {
  return hasSqlState(error, CASE_LIFECYCLE_SQLSTATE);
}
