import { expect } from "vitest";

/** Postgres SQLSTATE codes the invariant tests assert. */
export const PG_FOREIGN_KEY_VIOLATION = "23503";
export const PG_INSUFFICIENT_PRIVILEGE = "42501";
export const PG_RESTRICT_VIOLATION = "23001";
export const PG_CHECK_VIOLATION = "23514";
export const PG_UNIQUE_VIOLATION = "23505";

type PgRefusal = { code: string; constraint: unknown };

/** The postgres.js error behind a drizzle wrapper (its `cause` chain), or the error itself. */
function postgresRefusal(error: unknown): PgRefusal | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null) return undefined;
    if ("code" in current && typeof current.code === "string") {
      return {
        code: current.code,
        constraint:
          "constraint_name" in current ? current.constraint_name : undefined,
      };
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

/**
 * Awaits `statement` and fails unless Postgres refused it with `code` (and, when given, the named
 * `constraint`). Drizzle wraps the driver error, so the code is read from the cause chain.
 * Run it inside its own transaction or savepoint: a refused statement aborts the transaction it ran in.
 */
export async function expectPostgresRefusal(
  statement: PromiseLike<unknown>,
  expected: { readonly code: string; readonly constraint?: string }
): Promise<void> {
  let thrown: unknown;
  try {
    await statement;
  } catch (error) {
    thrown = error;
  }
  expect(thrown, "expected Postgres to refuse the statement").toBeDefined();
  const refusal = postgresRefusal(thrown);
  expect(refusal?.code).toBe(expected.code);
  if (expected.constraint !== undefined) {
    expect(refusal?.constraint).toBe(expected.constraint);
  }
}
