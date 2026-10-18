import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  HISTORY_CONTEXT_MISSING_SQLSTATE,
  type CaseId,
} from "@watchdog/schemas/shared";
import {
  expectPostgresRefusal,
  listAllGraphHistory,
  resetTestDb,
  prepareCasePurge,
  seedCase,
  seedEntity,
  withSystemHistoryContext,
  withTestTx,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import { APP_ROLE } from "../app-role.ts";
import { db } from "../client.ts";
import { setGraphHistoryContext } from "../history-context.ts";

/**
 * Issue #352: the application role may not write the Graph without a history context
 * (`watchdog.channel`), enforced by the BEFORE trigger `graph_history_context_guard_trg`
 * (migration `graph_history_context_guard`). `db` is the application role (`DATABASE_URL`);
 * `ownerDb` is the table owner (`DATABASE_URL_MIGRATE`, what migrations and maintenance run as).
 */
const ownerClient = postgres(process.env.DATABASE_URL_MIGRATE ?? "", {
  max: 2,
  idle_timeout: 5,
  onnotice: () => {},
});
const ownerDb = drizzle(ownerClient);

afterAll(async () => {
  await ownerClient.end({ timeout: 5 });
});

const [E1, E2, E3, NEW] = [10, 11, 12, 99].map((n) => testId(500 + n));
const ids = {
  edge: testId(520),
  identifier: testId(521),
  claim: testId(522),
  event: testId(523),
  question: testId(524),
  task: testId(525),
  evidence1: testId(526),
  evidence2: testId(527),
};

type Fixture = { caseId: CaseId };

/** One Case with a row in every Graph table, written by the owner (so as the system). */
async function fixture(): Promise<Fixture> {
  const cased = await seedCase(db);
  const c = cased.id;
  const run = async (statement: SQL) => {
    await ownerDb.execute(statement);
  };
  await run(sql`insert into entities (id, case_id, kind, name, slug) values
    (${E1}, ${c}, 'person', 'One', 'one'), (${E2}, ${c}, 'org', 'Two', 'two'),
    (${E3}, ${c}, 'org', 'Three', 'three')`);
  await run(sql`insert into evidence (id, case_id, kind, actor_id) values
    (${ids.evidence1}, ${c}, 'attestation', 'u'), (${ids.evidence2}, ${c}, 'attestation', 'u')`);
  await run(sql`insert into edges (id, case_id, from_id, to_id, predicate, confidence)
    values (${ids.edge}, ${c}, ${E1}, ${E2}, 'associate_of', 'unverified')`);
  await run(sql`insert into identifiers (id, case_id, entity_id, type, value, confidence)
    values (${ids.identifier}, ${c}, ${E1}, 'email', 'a@b.test', 'unverified')`);
  await run(sql`insert into claims (id, case_id, entity_id, text, confidence)
    values (${ids.claim}, ${c}, ${E1}, 'x', 'unverified')`);
  await run(sql`insert into events (id, case_id, entity_id, "when", what)
    values (${ids.event}, ${c}, ${E1}, '1840', 'x')`);
  await run(sql`insert into questions (id, case_id, entity_id, text)
    values (${ids.question}, ${c}, ${E1}, 'x?')`);
  await run(sql`insert into tasks (id, case_id, entity_id, title)
    values (${ids.task}, ${c}, ${E1}, 't')`);
  await run(sql`insert into claim_evidence (claim_id, case_id, evidence_id)
    values (${ids.claim}, ${c}, ${ids.evidence1})`);
  await run(sql`insert into identifier_evidence (identifier_id, case_id, evidence_id)
    values (${ids.identifier}, ${c}, ${ids.evidence1})`);
  await run(sql`insert into edge_evidence (edge_id, case_id, evidence_id)
    values (${ids.edge}, ${c}, ${ids.evidence1})`);
  return { caseId: c };
}

type Op = "insert" | "update" | "delete";
type Statements = Record<Op, (c: string) => SQL>;

/** One INSERT, UPDATE and DELETE per guarded table; each touches rows `fixture` made. */
const GRAPH_TABLES: Record<string, Statements> = {
  entities: {
    insert: (c) =>
      sql`insert into entities (id, case_id, kind, name, slug) values (${NEW}, ${c}, 'org', 'New', 'new')`,
    update: () => sql`update entities set name = 'Renamed' where id = ${E1}`,
    delete: () => sql`delete from entities where id = ${E3}`,
  },
  edges: {
    insert: (c) =>
      sql`insert into edges (id, case_id, from_id, to_id, predicate, confidence) values (${NEW}, ${c}, ${E1}, ${E3}, 'associate_of', 'unverified')`,
    update: () => sql`update edges set notes = 'n' where id = ${ids.edge}`,
    delete: () => sql`delete from edges where id = ${ids.edge}`,
  },
  identifiers: {
    insert: (c) =>
      sql`insert into identifiers (id, case_id, entity_id, type, value, confidence) values (${NEW}, ${c}, ${E1}, 'email', 'n@b.test', 'unverified')`,
    update: () =>
      sql`update identifiers set status = 'current' where id = ${ids.identifier}`,
    delete: () => sql`delete from identifiers where id = ${ids.identifier}`,
  },
  claims: {
    insert: (c) =>
      sql`insert into claims (id, case_id, entity_id, text, confidence) values (${NEW}, ${c}, ${E1}, 'n', 'unverified')`,
    update: () => sql`update claims set text = 'y' where id = ${ids.claim}`,
    delete: () => sql`delete from claims where id = ${ids.claim}`,
  },
  events: {
    insert: (c) =>
      sql`insert into events (id, case_id, entity_id, "when", what) values (${NEW}, ${c}, ${E1}, '1841', 'n')`,
    update: () => sql`update events set what = 'y' where id = ${ids.event}`,
    delete: () => sql`delete from events where id = ${ids.event}`,
  },
  questions: {
    insert: (c) =>
      sql`insert into questions (id, case_id, entity_id, text) values (${NEW}, ${c}, ${E1}, 'n?')`,
    update: () =>
      sql`update questions set text = 'y?' where id = ${ids.question}`,
    delete: () => sql`delete from questions where id = ${ids.question}`,
  },
  tasks: {
    insert: (c) =>
      sql`insert into tasks (id, case_id, title) values (${NEW}, ${c}, 'n')`,
    update: () => sql`update tasks set title = 'u' where id = ${ids.task}`,
    delete: () => sql`delete from tasks where id = ${ids.task}`,
  },
  claim_evidence: {
    insert: (c) =>
      sql`insert into claim_evidence (claim_id, case_id, evidence_id) values (${ids.claim}, ${c}, ${ids.evidence2})`,
    update: () =>
      sql`update claim_evidence set case_id = case_id where claim_id = ${ids.claim}`,
    delete: () => sql`delete from claim_evidence where claim_id = ${ids.claim}`,
  },
  identifier_evidence: {
    insert: (c) =>
      sql`insert into identifier_evidence (identifier_id, case_id, evidence_id) values (${ids.identifier}, ${c}, ${ids.evidence2})`,
    update: () =>
      sql`update identifier_evidence set case_id = case_id where identifier_id = ${ids.identifier}`,
    delete: () =>
      sql`delete from identifier_evidence where identifier_id = ${ids.identifier}`,
  },
  edge_evidence: {
    insert: (c) =>
      sql`insert into edge_evidence (edge_id, case_id, evidence_id) values (${ids.edge}, ${c}, ${ids.evidence2})`,
    update: () =>
      sql`update edge_evidence set case_id = case_id where edge_id = ${ids.edge}`,
    delete: () => sql`delete from edge_evidence where edge_id = ${ids.edge}`,
  },
};

function statement(table: string, op: Op, caseId: string): SQL {
  const statements = GRAPH_TABLES[table];
  if (!statements) throw new Error(`no statements for ${table}`);
  return statements[op](caseId);
}

const OPS: Op[] = ["insert", "update", "delete"];
const MATRIX = Object.keys(GRAPH_TABLES).flatMap((table) =>
  OPS.map((op) => ({ table, op }))
);

/** Every table's rows, to prove a refused statement changed nothing. */
async function counts(): Promise<Record<string, number>> {
  const tables = [...Object.keys(GRAPH_TABLES), "cases", "graph_history"];
  const rows = await Promise.all(
    tables.map(async (table) => {
      const [row] = await ownerDb.execute<{ n: number }>(
        sql`select count(*)::int as n from ${sql.identifier(table)}`
      );
      return [table, row?.n ?? -1] as const;
    })
  );
  return Object.fromEntries(rows);
}

/** The message and HINT of the Postgres error behind a drizzle failure. */
async function refusalDetails(
  statement: PromiseLike<unknown>
): Promise<{ message: string; hint: string }> {
  try {
    await statement;
  } catch (error) {
    let current: unknown = error;
    for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
      if ("code" in current) {
        const hint = "hint" in current ? current.hint : undefined;
        return {
          message: current.message,
          hint: typeof hint === "string" ? hint : "",
        };
      }
      current = current.cause;
    }
  }
  return { message: "", hint: "" };
}

beforeEach(async () => {
  await resetTestDb();
});

describe("graph history context guard: the application role", () => {
  it("names the application role the way app-role.ts does", async () => {
    const [fn] = await ownerDb.execute<{ src: string }>(
      sql`select prosrc as src from pg_proc where proname = 'graph_require_history_context'`
    );
    expect(fn?.src).toContain(`current_user = '${APP_ROLE}'`);
    const [me] = await db.execute<{ who: string }>(
      sql`select current_user as who`
    );
    expect(me?.who).toBe(APP_ROLE);
  });

  it.each(MATRIX)(
    "refuses $op on $table with no history context",
    async ({ table, op }) => {
      const { caseId } = await fixture();
      const before = await counts();
      await expectPostgresRefusal(db.execute(statement(table, op, caseId)), {
        code: HISTORY_CONTEXT_MISSING_SQLSTATE,
      });
      expect(await counts()).toEqual(before);
    }
  );

  it("refuses a Case delete with no history context, and changes nothing", async () => {
    const { caseId } = await fixture();
    const before = await counts();
    // The Case lifecycle guard (WD002) is satisfied first, so only the missing context refuses.
    await expectPostgresRefusal(
      db.transaction(async (tx) => {
        await prepareCasePurge(tx, caseId);
        await tx.execute(sql`delete from cases where id = ${caseId}`);
      }),
      { code: HISTORY_CONTEXT_MISSING_SQLSTATE }
    );
    expect(await counts()).toEqual(before);
  });

  it("does not need a context to insert or update a Case (neither touches the Graph)", async () => {
    const created = await seedCase(db);
    await db.execute(
      sql`update cases set description = 'd' where id = ${created.id}`
    );
  });

  it("treats an empty channel like an unset one", async () => {
    const { caseId } = await fixture();
    await expectPostgresRefusal(
      db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('watchdog.channel', '', true)`);
        await tx.execute(statement("entities", "insert", caseId));
      }),
      { code: HISTORY_CONTEXT_MISSING_SQLSTATE }
    );
  });

  it("names the missing setting and what to call", async () => {
    const { caseId } = await fixture();
    const { message, hint } = await refusalDetails(
      db.execute(statement("tasks", "insert", caseId))
    );
    expect(message).toContain("watchdog.channel");
    expect(message).toContain('"tasks"');
    expect(hint).toContain("setHistoryContextEffect");
    expect(hint).toContain("withSystemHistoryContext");
  });

  it.each(MATRIX)(
    "allows $op on $table with a context, and records its channel and actor",
    async ({ table, op }) => {
      const { caseId } = await fixture();
      const before = (await listAllGraphHistory(db)).length;
      await db.transaction(async (tx) => {
        await setGraphHistoryContext(tx, {
          actorId: "user-1",
          actorLabel: null,
          channel: "dossier",
        });
        await tx.execute(statement(table, op, caseId));
      });
      const added = (await listAllGraphHistory(db)).slice(before);
      // an UPDATE of a link row that changes nothing records nothing
      if (!(op === "update" && table.endsWith("_evidence"))) {
        expect(added.length).toBeGreaterThan(0);
      }
      for (const row of added) {
        expect(row).toMatchObject({ channel: "dossier", actorId: "user-1" });
      }
    }
  );

  it("allows the explicit system context, recorded as the system with no actor", async () => {
    const { caseId } = await fixture();
    const before = (await listAllGraphHistory(db)).length;
    await withSystemHistoryContext(db, (tx) =>
      tx.execute(statement("claims", "insert", caseId))
    );
    const added = (await listAllGraphHistory(db)).slice(before);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ channel: "system", actorId: null });
  });

  it("does not refuse the cascades of a permitted Entity delete", async () => {
    await fixture();
    const before = (await listAllGraphHistory(db)).length;
    await db.transaction(async (tx) => {
      await setGraphHistoryContext(tx, {
        actorId: "user-1",
        channel: "dossier",
      });
      // E1 owns an Identifier, Claim, Event, Question and Task (SET NULL), and is an Edge end;
      // the Evidence links of the Claim, Identifier and Edge go with them.
      await tx.execute(sql`delete from entities where id = ${E1}`);
    });
    const [left] = await ownerDb.execute<Record<string, number>>(sql`select
      (select count(*) from identifiers)::int as identifiers,
      (select count(*) from claims)::int as claims,
      (select count(*) from events)::int as events,
      (select count(*) from questions)::int as questions,
      (select count(*) from edges)::int as edges,
      (select count(*) from claim_evidence)::int as claim_evidence,
      (select count(*) from identifier_evidence)::int as identifier_evidence,
      (select count(*) from edge_evidence)::int as edge_evidence`);
    expect(left).toEqual({
      identifiers: 0,
      claims: 0,
      events: 0,
      questions: 0,
      edges: 0,
      claim_evidence: 0,
      identifier_evidence: 0,
      edge_evidence: 0,
    });
    const [task] = await ownerDb.execute<{ entity_id: string | null }>(
      sql`select entity_id from tasks where id = ${ids.task}`
    );
    expect(task?.entity_id).toBeNull();
    const added = (await listAllGraphHistory(db)).slice(before);
    expect(added.length).toBeGreaterThanOrEqual(6);
    expect(added.every((row) => row.actorId === "user-1")).toBe(true);
  });

  it("deletes a Case with a context, taking the Graph and its history with it", async () => {
    const { caseId } = await fixture();
    await db.transaction(async (tx) => {
      await setGraphHistoryContext(tx, {
        actorId: "user-1",
        channel: "dossier",
      });
      await prepareCasePurge(tx, caseId);
      await tx.execute(sql`delete from cases where id = ${caseId}`);
    });
    const after = await counts();
    expect(Object.values(after).every((n) => n === 0)).toBe(true);
  });
});

describe("withSystemHistoryContext leaves the caller's context as it found it", () => {
  const settings = (tx: Parameters<Parameters<typeof withTestTx>[0]>[0]) =>
    tx.execute<{ actor: string | null; channel: string | null }>(sql`select
      nullif(current_setting('watchdog.actor_id', true), '') as actor,
      nullif(current_setting('watchdog.channel', true), '') as channel`);

  it("leaves none behind after a seed, so the next write is still refused", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      await seedEntity(tx, cased.id, { id: E1, slug: "one" });
      expect((await settings(tx))[0]).toEqual({ actor: null, channel: null });
      await expectPostgresRefusal(
        tx.transaction((inner) =>
          inner.execute(statement("entities", "insert", cased.id))
        ),
        { code: HISTORY_CONTEXT_MISSING_SQLSTATE }
      );
    });
  });

  it("restores the caller's actor and channel after a callback that succeeds", async () => {
    await withTestTx(async (tx) => {
      await setGraphHistoryContext(tx, {
        actorId: "user-1",
        channel: "dossier",
      });
      await withSystemHistoryContext(tx, async (inner) => {
        expect((await settings(inner))[0]).toEqual({
          actor: null,
          channel: "system",
        });
      });
      expect((await settings(tx))[0]).toEqual({
        actor: "user-1",
        channel: "dossier",
      });
    });
  });

  it("restores the caller's actor and channel when the callback throws and the caller carries on", async () => {
    await withTestTx(async (tx) => {
      await setGraphHistoryContext(tx, {
        actorId: "user-1",
        channel: "dossier",
      });
      await expect(
        withSystemHistoryContext(tx, () => Promise.reject(new Error("boom")))
      ).rejects.toThrow("boom");
      expect((await settings(tx))[0]).toEqual({
        actor: "user-1",
        channel: "dossier",
      });
    });
  });
});

describe("graph history context guard: the owner role", () => {
  it.each(MATRIX)(
    "allows $op on $table with no context, recorded as the system",
    async ({ table, op }) => {
      const { caseId } = await fixture();
      const before = (await listAllGraphHistory(db)).length;
      await ownerDb.execute(statement(table, op, caseId));
      const added = (await listAllGraphHistory(db)).slice(before);
      for (const row of added) {
        expect(row).toMatchObject({ channel: "system", actorId: null });
      }
    }
  );

  it("deletes a Case with no context", async () => {
    const { caseId } = await fixture();
    await ownerDb.execute(sql`delete from cases where id = ${caseId}`);
    expect((await counts()).entities).toBe(0);
  });
});
