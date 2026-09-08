export type DomainErrorCode =
  | "not_found"
  | "conflict"
  | "invalid"
  | "forbidden";

const DOMAIN_ERROR_BRAND = Symbol.for("watchdog.DomainError");

// Legacy throw-based bridge for tryDb / postgres drivers — not Effect TaggedError.
// oxlint-disable-next-line effecttsgo/extends-native-error -- DomainError brand survives duplicate module instances
export class DomainError extends Error {
  /** Brand survives duplicate module instances, unlike `instanceof`. */
  readonly [DOMAIN_ERROR_BRAND] = true;

  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }

  static is(error: unknown): error is DomainError {
    return (
      error instanceof Error &&
      (error as Partial<DomainError>)[DOMAIN_ERROR_BRAND] === true
    );
  }
}

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
