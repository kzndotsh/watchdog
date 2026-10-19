import { ORPCError } from "@orpc/server";
import { beforeAll, describe, expect, it } from "vitest";

import { SCOPES } from "@watchdog/schemas/shared";
import type { Scope } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import { resetTestDb, seedOrganizationMember, testDb } from "@watchdog/test-db";

import { callProcedure, clientFor } from "./org-isolation-fixtures";
import { INVALID_INPUT, keyWith, scopeRows } from "./scope-matrix";

/**
 * Key-scope dimension of the isolation matrix, allowed half (the refusals are the unit test
 * `scope-matrix.test.ts`). A key holding a procedure's declared scope gets past the middleware:
 * the call then fails on input validation, a missing row or a role check, or succeeds, and any of
 * those is fine; only a scope refusal is a defect. The expectation comes from each procedure's
 * declared `.meta({ scope })`, so a new procedure is covered with no edit here.
 */
const USER = "wd368-member";
const rows = scopeRows();
const scoped = rows.flatMap((row) => (row.kind === "scoped" ? [row] : []));
const writeScopes = SCOPES.filter((scope) => scope !== "cases:read");

const client = (scopes: readonly Scope[]) =>
  clientFor(TEST_ORGANIZATION_ID, USER, keyWith(scopes));

/** Codes a call may end with after the scope middleware let it through (a role check is `FORBIDDEN:forbidden`). */
const PASSED_CODES = new Set([
  "ok",
  "BAD_REQUEST",
  "NOT_FOUND",
  "CONFLICT",
  "FORBIDDEN:forbidden",
]);

/**
 * How the call ended: `ok`, an oRPC code (`BAD_REQUEST`), `FORBIDDEN:<data.code>`, or
 * `thrown:<message>` for anything that is not an oRPC error.
 */
async function outcome(
  scopes: readonly Scope[],
  path: string
): Promise<string> {
  try {
    await callProcedure(client(scopes), path, INVALID_INPUT);
    return "ok";
  } catch (error) {
    if (!(error instanceof ORPCError)) {
      return `thrown:${error instanceof Error ? error.message : String(error)}`;
    }
    const data: unknown = error.data;
    const code =
      typeof data === "object" && data !== null
        ? Reflect.get(data, "code")
        : undefined;
    return error.code === "FORBIDDEN"
      ? `FORBIDDEN:${String(code)}`
      : error.code;
  }
}

/** Fails (naming the outcome) unless the call got past the scope check by an expected route. */
async function expectPassed(scopes: readonly Scope[], path: string) {
  const result = await outcome(scopes, path);
  expect(PASSED_CODES.has(result), `${path} ended as ${result}`).toBe(true);
}

describe("key-scope matrix: allowed", () => {
  beforeAll(async () => {
    await resetTestDb();
    await seedOrganizationMember(testDb, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: USER,
      role: "member",
    });
  });

  it("finds scoped procedures to call", () => {
    expect(scoped.length).toBeGreaterThan(50);
    expect(writeScopes.length).toBeGreaterThan(0);
  });

  for (const row of scoped) {
    it(`${row.path} lets a key holding exactly ${row.scope} through the scope check`, async () => {
      await expectPassed([row.scope], row.path);
    });
  }

  // A write scope implies `cases:read`: a key with only that write scope reads.
  for (const row of scoped.filter((r) => r.scope === "cases:read")) {
    it.each(writeScopes)(
      `${row.path} (cases:read) is open to a key holding only %s`,
      async (write) => {
        await expectPassed([write], row.path);
      }
    );
  }
});
