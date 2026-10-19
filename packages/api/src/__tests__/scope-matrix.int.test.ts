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

/** The call's outcome when it is a scope refusal (`insufficient_scope`, or a key on a session-only route). */
async function scopeRefusal(
  scopes: readonly Scope[],
  path: string
): Promise<string | null> {
  try {
    await callProcedure(client(scopes), path, INVALID_INPUT);
  } catch (error) {
    if (error instanceof ORPCError && error.code === "FORBIDDEN") {
      const data: unknown = error.data;
      const code =
        typeof data === "object" && data !== null
          ? Reflect.get(data, "code")
          : undefined;
      if (code === "insufficient_scope" || code === "forbidden") return code;
    }
  }
  return null;
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
  });

  for (const row of scoped) {
    it(`${row.path} lets a key holding exactly ${row.scope} through the scope check`, async () => {
      expect(await scopeRefusal([row.scope], row.path)).toBeNull();
    });
  }

  // A write scope implies `cases:read`: a key with only that write scope reads.
  for (const row of scoped.filter((r) => r.scope === "cases:read")) {
    it.each(writeScopes)(
      `${row.path} (cases:read) is open to a key holding only %s`,
      async (write) => {
        expect(await scopeRefusal([write], row.path)).toBeNull();
      }
    );
  }
});
