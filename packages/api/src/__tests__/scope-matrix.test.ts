import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";

import { SCOPES } from "@watchdog/schemas/shared";
import type { Scope } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";

import { router } from "../router";
import {
  callProcedure,
  clientFor,
  declaredScope,
  procedurePaths,
} from "./org-isolation-fixtures";
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

describe("declared scopes", () => {
  // The matrix reads each procedure's declaration, so this record makes a new or changed scope
  // visible in review: changing a procedure's scope means updating this snapshot.
  it("matches the reviewed record of every procedure's scope", () => {
    const declared = Object.fromEntries(
      [...procedurePaths(router)]
        .sort()
        .map((path) => [path, declaredScope(router, path)])
    );
    expect(declared).toMatchInlineSnapshot(`
      {
        "activity.listRecent": "cases:read",
        "auth.whoami": "cases:read",
        "capabilities.list": "cases:read",
        "capabilities.listPlaybooks": "cases:read",
        "cases.counts": "cases:read",
        "cases.create": "graph:write",
        "cases.delete": "session",
        "cases.deletionPolicy": "cases:read",
        "cases.get": "cases:read",
        "cases.getBySlug": "cases:read",
        "cases.getDeletedBySlug": "cases:read",
        "cases.list": "cases:read",
        "cases.listDeleted": "cases:read",
        "cases.purge": "session",
        "cases.restore": "session",
        "cases.update": "graph:write",
        "claims.create": "graph:write",
        "claims.list": "cases:read",
        "claims.retract": "graph:write",
        "claims.update": "graph:write",
        "credentials.delete": "session",
        "credentials.list": "cases:read",
        "credentials.put": "session",
        "edges.create": "graph:write",
        "edges.delete": "graph:write",
        "edges.list": "cases:read",
        "edges.listForCase": "cases:read",
        "edges.update": "graph:write",
        "entities.create": "graph:write",
        "entities.delete": "graph:write",
        "entities.get": "cases:read",
        "entities.getMany": "cases:read",
        "entities.list": "cases:read",
        "entities.recordAiHandoff": "graph:write",
        "entities.update": "graph:write",
        "events.create": "graph:write",
        "events.delete": "graph:write",
        "events.list": "cases:read",
        "events.update": "graph:write",
        "evidence.attachEntity": "graph:write",
        "evidence.confirmFile": "evidence:write",
        "evidence.createPaste": "evidence:write",
        "evidence.createUrl": "evidence:write",
        "evidence.downloadUrl": "cases:read",
        "evidence.enrich": "evidence:write",
        "evidence.get": "cases:read",
        "evidence.getMany": "cases:read",
        "evidence.list": "cases:read",
        "evidence.listProviderCalls": "cases:read",
        "evidence.pickerPage": "cases:read",
        "evidence.presign": "evidence:write",
        "evidence.process": "evidence:write",
        "evidence.restore": "graph:write",
        "evidence.softDelete": "graph:write",
        "graph.listWrites": "cases:read",
        "graph.write": "graph:write",
        "health": "public",
        "history.list": "cases:read",
        "identifiers.create": "graph:write",
        "identifiers.delete": "graph:write",
        "identifiers.getMany": "cases:read",
        "identifiers.list": "cases:read",
        "identifiers.update": "graph:write",
        "jobs.cancel": "evidence:write",
        "jobs.cancelPlaybook": "evidence:write",
        "jobs.get": "cases:read",
        "jobs.getPlaybookRun": "cases:read",
        "jobs.listForCase": "cases:read",
        "jobs.listProviderCalls": "cases:read",
        "jobs.retry": "evidence:write",
        "jobs.start": "evidence:write",
        "jobs.startPlaybook": "evidence:write",
        "organization.getJobStartLimits": "cases:read",
        "organization.getSettings": "cases:read",
        "organization.setJobStartLimit": "session",
        "organization.updateSettings": "session",
        "proposals.accept": "session",
        "proposals.create": "proposals:write",
        "proposals.get": "cases:read",
        "proposals.listForCase": "cases:read",
        "proposals.reject": "session",
        "questions.create": "graph:write",
        "questions.delete": "graph:write",
        "questions.list": "cases:read",
        "questions.reopen": "graph:write",
        "questions.resolve": "graph:write",
        "questions.update": "graph:write",
        "ready": "public",
        "search.case": "cases:read",
        "tasks.board": "cases:read",
        "tasks.create": "graph:write",
        "tasks.due": "cases:read",
        "tasks.get": "cases:read",
        "tasks.list": "cases:read",
        "tasks.remove": "graph:write",
        "tasks.reorder": "graph:write",
        "tasks.update": "graph:write",
      }
    `);
  });
});

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
