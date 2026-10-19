import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";

import { SCOPES } from "@watchdog/schemas/shared";
import type { Scope } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";

import { callProcedure, clientFor } from "./org-isolation-fixtures";
import {
  INVALID_INPUT,
  keyWith,
  lackingScopes,
  scopeRows,
} from "./scope-matrix";

/**
 * Key-scope dimension of the isolation matrix, refusal half (no database: the scope middleware
 * answers before input validation and before any handler). The allowed half is
 * `scope-matrix.int.test.ts`. Expectations come from each procedure's declared `.meta({ scope })`.
 */
const rows = scopeRows();
const client = (scopes: readonly Scope[]) =>
  clientFor(TEST_ORGANIZATION_ID, "wd368-user", keyWith(scopes));

async function refusal(
  run: () => Promise<unknown>
): Promise<ORPCError<string, unknown>> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ORPCError) return error;
    throw error;
  }
  throw new Error("expected the call to be refused");
}

describe("key-scope matrix: refusals", () => {
  it("covers the router's procedures", () => {
    expect(rows.length).toBeGreaterThan(50);
    expect(rows.some((row) => row.kind === "scoped")).toBe(true);
    expect(rows.some((row) => row.kind === "session")).toBe(true);
  });

  for (const row of rows) {
    if (row.kind === "session") {
      it(`${row.path} (session) refuses a key holding every scope as forbidden`, async () => {
        const error = await refusal(() =>
          callProcedure(client(SCOPES), row.path, INVALID_INPUT)
        );
        expect(error.code).toBe("FORBIDDEN");
        expect(error.data).toMatchObject({ code: "forbidden" });
      });
    } else {
      it(`${row.path} (${row.scope}) refuses a key without ${row.scope} as insufficient_scope`, async () => {
        const error = await refusal(() =>
          callProcedure(
            client(lackingScopes(row.scope)),
            row.path,
            INVALID_INPUT
          )
        );
        expect(error.code).toBe("FORBIDDEN");
        expect(error.data).toMatchObject({
          code: "insufficient_scope",
          requiredScope: row.scope,
        });
      });
    }
  }
});
