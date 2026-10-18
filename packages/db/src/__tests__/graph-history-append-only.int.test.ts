import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { CaseId } from "@watchdog/schemas/shared";
import { resetTestDb, seedCase } from "@watchdog/test-db";

import { cases, db, graphHistory, graphHistoryRepo } from "../index.ts";

/**
 * `graph_history` is append-only (migration `protect_graph_history`): the app
 * role holds no UPDATE or DELETE on it, and a trigger refuses UPDATE for every
 * role and DELETE while the Case exists, so the Case's own cascade is the only
 * way rows leave. The app role is `DATABASE_URL`; the table owner is
 * `DATABASE_URL_MIGRATE` (what migrations run as).
 */
const owner = postgres(process.env.DATABASE_URL_MIGRATE ?? "", {
  max: 1,
  idle_timeout: 5,
});

afterAll(async () => {
  await owner.end({ timeout: 5 });
});

async function seedHistoryRow(caseId: CaseId) {
  const created = await graphHistoryRepo.append(db, {
    caseId,
    kind: "entity",
    rowId: "00000000-0000-4000-8000-0000000000e1",
    op: "create",
    channel: "dossier",
    actorId: "user-1",
    actorLabel: null,
    before: null,
    after: { name: "Ada" },
  });
  if (created === null) throw new Error("history row");
  return created.id;
}

/** The SQLSTATE of a failed statement (drizzle wraps the driver error as `cause`). */
const sqlState = async (run: () => PromiseLike<unknown>) => {
  try {
    await run();
  } catch (error) {
    const cause: unknown =
      typeof error === "object" && error !== null && "cause" in error
        ? error.cause
        : error;
    if (typeof cause === "object" && cause !== null && "code" in cause) {
      return String(cause.code);
    }
  }
  return "none";
};

describe("graph_history is append-only", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("the app role cannot UPDATE or DELETE a history row (privilege error)", async () => {
    const cased = await seedCase(db);
    const id = await seedHistoryRow(cased.id);
    expect(
      await sqlState(() =>
        db
          .update(graphHistory)
          .set({ kind: "claim" })
          .where(eq(graphHistory.id, id))
      )
    ).toBe("42501");
    expect(
      await sqlState(() =>
        db.delete(graphHistory).where(eq(graphHistory.id, id))
      )
    ).toBe("42501");
    expect(
      await graphHistoryRepo.listForRow(db, {
        caseId: cased.id,
        kind: "entity",
        rowId: "00000000-0000-4000-8000-0000000000e1",
        limit: 5,
      })
    ).toHaveLength(1);
  });

  it("even the table owner cannot UPDATE a row or DELETE one while its Case exists", async () => {
    const cased = await seedCase(db);
    const id = await seedHistoryRow(cased.id);
    // restrict_violation
    expect(
      await sqlState(
        () => owner`UPDATE graph_history SET kind = 'claim' WHERE id = ${id}`
      )
    ).toBe("23001");
    expect(
      await sqlState(() => owner`DELETE FROM graph_history WHERE id = ${id}`)
    ).toBe("23001");
    const [{ count }] =
      await owner`SELECT count(*)::int AS count FROM graph_history`;
    expect(count).toBe(1);
  });

  it("deleting the Case purges its history with it, as the app role", async () => {
    const keep = await seedCase(db, { slug: "keep" });
    const gone = await seedCase(db, { slug: "gone" });
    await seedHistoryRow(keep.id);
    await seedHistoryRow(gone.id);
    await db.delete(cases).where(eq(cases.id, gone.id));
    const rows = await owner`SELECT case_id FROM graph_history`;
    expect(rows.map((row) => row.case_id)).toEqual([keep.id]);
  });

  it("refuses a row whose before/after do not fit its op", async () => {
    const cased = await seedCase(db);
    const insert = (op: string, before: unknown, after: unknown) =>
      sqlState(
        () => owner`
          INSERT INTO graph_history (case_id, kind, row_id, op, channel, before, after)
          VALUES (${cased.id}, 'entity', ${"00000000-0000-4000-8000-0000000000e2"}, ${op}, 'dossier',
            ${before === null ? null : JSON.stringify(before)}::jsonb,
            ${after === null ? null : JSON.stringify(after)}::jsonb)`
      );
    // check_violation
    expect(await insert("create", { a: 1 }, { a: 2 })).toBe("23514");
    expect(await insert("delete", null, null)).toBe("23514");
    expect(await insert("update", null, { a: 1 })).toBe("23514");
    expect(await insert("update", { a: 1 }, { a: 2 })).toBe("none");
  });
});
