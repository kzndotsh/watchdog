import { sql, type SQL } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetTestDb,
  prepareCasePurge,
  seedCase,
  seedEntity,
  withSystemHistoryContext,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import {
  cases,
  db,
  graphHistory,
  setGraphHistoryContext,
  type GraphHistoryContext,
} from "../index.ts";

/**
 * `graph_history` is written by database triggers on the seven Graph tables
 * (`0001_database_logic`), so these tests write the tables with raw
 * SQL, as an application bug, a seed or a person with psql would, and read the
 * history back. The app role is `DATABASE_URL`; the table owner is
 * `DATABASE_URL_MIGRATE` (what migrations run as).
 */
const owner = postgres(process.env.DATABASE_URL_MIGRATE ?? "", {
  max: 3,
  idle_timeout: 5,
});

afterAll(async () => {
  await owner.end({ timeout: 5 });
});

/**
 * A raw write as the application role under the explicit `system` context (the role is refused a
 * Graph write with none; `graph-history-context-guard.int.test.ts` covers that).
 */
const write = (statement: SQL) =>
  withSystemHistoryContext(db, (tx) => tx.execute(statement));

const E1 = testId(101);
const E2 = testId(102);

async function history() {
  return db.select().from(graphHistory).orderBy(graphHistory.id);
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

async function seedGraph() {
  const cased = await seedCase(db);
  await seedEntity(db, cased.id, { id: E1, slug: "one" });
  await seedEntity(db, cased.id, { id: E2, slug: "two" });
  return cased;
}

describe("graph_history triggers", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("records raw writes to every Graph table, as the system", async () => {
    const cased = await seedCase(db);
    const ids = Object.fromEntries(
      ["edge", "identifier", "claim", "event", "question", "task"].map(
        (kind, index) => [kind, testId(200 + index)]
      )
    );
    await write(sql`insert into entities (id, case_id, kind, name, slug) values
      (${E1}, ${cased.id}, 'person', 'A', 'a'), (${E2}, ${cased.id}, 'org', 'B', 'b')`);
    await write(sql`insert into edges (id, case_id, from_id, to_id, predicate, confidence)
      values (${ids.edge}, ${cased.id}, ${E1}, ${E2}, 'associate_of', 'unverified')`);
    await write(sql`insert into identifiers (id, case_id, entity_id, type, value, confidence)
      values (${ids.identifier}, ${cased.id}, ${E1}, 'email', 'a@b.test', 'unverified')`);
    await write(sql`insert into claims (id, case_id, entity_id, text, confidence)
      values (${ids.claim}, ${cased.id}, ${E1}, 'x', 'unverified')`);
    await write(sql`insert into events (id, case_id, entity_id, "when", what)
      values (${ids.event}, ${cased.id}, ${E1}, '1840', 'x')`);
    await write(sql`insert into questions (id, case_id, entity_id, text)
      values (${ids.question}, ${cased.id}, ${E1}, 'x?')`);
    await write(sql`insert into tasks (id, case_id, title)
      values (${ids.task}, ${cased.id}, 't')`);

    await write(sql`update entities set name = 'A2' where id = ${E1}`);
    await write(sql`update edges set notes = 'n' where id = ${ids.edge}`);
    await write(
      sql`update identifiers set status = 'current' where id = ${ids.identifier}`
    );
    await write(sql`update claims set text = 'y' where id = ${ids.claim}`);
    await write(sql`update events set what = 'y' where id = ${ids.event}`);
    await write(
      sql`update questions set text = 'y?' where id = ${ids.question}`
    );
    await write(sql`update tasks set title = 'u' where id = ${ids.task}`);

    await write(sql`delete from edges where id = ${ids.edge}`);
    await write(sql`delete from identifiers where id = ${ids.identifier}`);
    await write(sql`delete from claims where id = ${ids.claim}`);
    await write(sql`delete from events where id = ${ids.event}`);
    await write(sql`delete from questions where id = ${ids.question}`);
    await write(sql`delete from tasks where id = ${ids.task}`);
    await write(sql`delete from entities where id = ${E2}`);

    const rows = await history();
    for (const [kind, rowId] of Object.entries(ids)) {
      const ops = rows
        .filter((row) => row.kind === kind && row.rowId === rowId)
        .map((row) => row.op);
      expect(ops, kind).toEqual(["create", "update", "delete"]);
    }
    const entityOps = rows
      .filter((row) => row.kind === "entity" && row.rowId === E1)
      .map((row) => row.op);
    expect(entityOps).toEqual(["create", "update"]);
    expect(rows.every((row) => row.channel === "system")).toBe(true);
    expect(rows.every((row) => row.actorId === null)).toBe(true);
    expect(rows.every((row) => row.caseId === cased.id)).toBe(true);
  });

  it("takes who and how from the transaction's settings, and fills the author columns from them", async () => {
    const cased = await seedCase(db);
    const context: GraphHistoryContext = {
      actorId: "user-1",
      actorLabel: "api-key:ci-bot",
      channel: "agent_write",
    };
    await db.transaction(async (tx) => {
      await setGraphHistoryContext(tx, context);
      await tx.execute(sql`insert into entities (id, case_id, kind, name, slug)
        values (${E1}, ${cased.id}, 'org', 'A', 'a')`);
      await tx.execute(sql`insert into claims (id, case_id, entity_id, text, confidence)
        values (${testId(300)}, ${cased.id}, ${E1}, 'x', 'unverified')`);
    });
    const rows = await history();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({
        actorId: "user-1",
        actorLabel: "api-key:ci-bot",
        channel: "agent_write",
      });
      expect(row.after).toMatchObject({
        created_by: "user-1",
        updated_by: "user-1",
      });
    }
    // the settings end with the transaction: the next write has none, so the owner's is the system
    await owner`update entities set name = 'B' where id = ${E1}`;
    const last = (await history()).at(-1);
    expect(last).toMatchObject({
      op: "update",
      actorId: null,
      channel: "system",
    });
    expect(last?.after).toMatchObject({ updated_by: null });
  });

  it("falls back to the system for a channel it does not know", async () => {
    const cased = await seedCase(db);
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('watchdog.channel', 'made-up', true)`
      );
      await tx.execute(
        sql`insert into tasks (id, case_id, title) values (${testId(301)}, ${cased.id}, 't')`
      );
    });
    expect((await history()).at(-1)?.channel).toBe("system");
  });

  it("keeps an author a statement sets itself (a backfill) and records a retract as a retract", async () => {
    const cased = await seedGraph();
    const claim = testId(302);
    await write(sql`insert into claims (id, case_id, entity_id, text, confidence)
      values (${claim}, ${cased.id}, ${E1}, 'x', 'unverified')`);
    await write(
      sql`update claims set created_by = 'old-author', updated_by = 'older' where id = ${claim}`
    );
    const [row] = await db.execute<{ created_by: string; updated_by: string }>(
      sql`select created_by, updated_by from claims where id = ${claim}`
    );
    expect(row).toEqual({ created_by: "old-author", updated_by: "older" });
    await write(
      sql`update claims set retracted = true, retract_kind = 'retracted' where id = ${claim}`
    );
    expect((await history()).at(-1)).toMatchObject({
      kind: "claim",
      op: "retract",
    });
  });

  it("records nothing for an update that changes only updated_at, and one row per Evidence link change", async () => {
    const cased = await seedGraph();
    const claim = testId(303);
    const evidence = testId(304);
    await write(sql`insert into claims (id, case_id, entity_id, text, confidence)
      values (${claim}, ${cased.id}, ${E1}, 'x', 'unverified')`);
    await write(sql`insert into evidence (id, case_id, kind, actor_id)
      values (${evidence}, ${cased.id}, 'attestation', 'u')`);
    const before = (await history()).length;
    await write(sql`update claims set updated_at = now() where id = ${claim}`);
    expect(await history()).toHaveLength(before);

    await write(
      sql`insert into claim_evidence (claim_id, case_id, evidence_id) values (${claim}, ${cased.id}, ${evidence})`
    );
    await write(
      sql`insert into claim_evidence (claim_id, case_id, evidence_id) values (${claim}, ${cased.id}, ${evidence}) on conflict do nothing`
    );
    let rows = (await history()).slice(before);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "claim",
      rowId: claim,
      op: "update",
    });
    expect(rows[0]?.before).toMatchObject({ evidence_ids: [] });
    expect(rows[0]?.after).toMatchObject({ evidence_ids: [evidence] });

    await write(sql`delete from claim_evidence where claim_id = ${claim}`);
    rows = (await history()).slice(before);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.before).toMatchObject({ evidence_ids: [evidence] });
    expect(rows[1]?.after).toMatchObject({ evidence_ids: [] });

    // deleting the Claim records its delete, with the links it still had
    await write(
      sql`insert into claim_evidence (claim_id, case_id, evidence_id) values (${claim}, ${cased.id}, ${evidence})`
    );
    await write(sql`delete from claims where id = ${claim}`);
    const last = (await history()).at(-1);
    expect(last).toMatchObject({ kind: "claim", op: "delete" });
    expect(last?.before).toMatchObject({ evidence_ids: [evidence] });
  });

  it("a failed transaction leaves no history", async () => {
    const cased = await seedCase(db);
    await expect(
      withSystemHistoryContext(db, async (tx) => {
        await tx.execute(
          sql`insert into tasks (id, case_id, title) values (${testId(305)}, ${cased.id}, 't')`
        );
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(await history()).toHaveLength(0);
  });

  it("an Entity delete records every row it cascades to, even one inserted while the delete waits", async () => {
    const cased = await seedCase(db);
    await seedEntity(db, cased.id, { id: E1, slug: "one" });
    const claim = testId(306);
    const task = testId(307);
    await write(sql`insert into tasks (id, case_id, entity_id, title)
      values (${task}, ${cased.id}, ${E1}, 't')`);
    let deleting: Promise<unknown> = Promise.resolve();
    await db.transaction(async (tx) => {
      // The insert holds a KEY SHARE lock on the Entity, so the delete below waits for it.
      await setGraphHistoryContext(tx, { channel: "system" });
      await tx.execute(sql`insert into claims (id, case_id, entity_id, text, confidence)
        values (${claim}, ${cased.id}, ${E1}, 'late', 'unverified')`);
      deleting = Promise.resolve(
        write(sql`delete from entities where id = ${E1}`)
      );
      await vi.waitFor(async () => {
        const [waiting] = await owner<{ n: number }[]>`
          select count(*)::int as n from pg_stat_activity
          where wait_event_type = 'Lock' and datname = current_database()`;
        expect(waiting?.n).toBeGreaterThan(0);
      });
    });
    await deleting;

    const rows = await history();
    const claimOps = rows
      .filter((row) => row.rowId === claim)
      .map((row) => row.op);
    expect(claimOps).toEqual(["create", "delete"]);
    expect(
      rows.filter((row) => row.kind === "entity").map((row) => row.op)
    ).toEqual(["create", "delete"]);
    const unlink = rows.find(
      (row) => row.rowId === task && row.op === "update"
    );
    expect(unlink).toMatchObject({ op: "update" });
    expect(unlink?.before).toMatchObject({ entity_id: E1 });
    expect(unlink?.after).toMatchObject({ entity_id: null });
  });

  it("deleting the Case purges its history with it, as the app role", async () => {
    const keep = await seedCase(db, { slug: "keep" });
    const gone = await seedCase(db, { slug: "gone" });
    await Promise.all(
      [keep, gone].map(async (cased, index) => {
        await write(sql`insert into tasks (id, case_id, title)
          values (${testId(310 + index)}, ${cased.id}, 't')`);
        await write(sql`insert into entities (id, case_id, kind, name, slug)
          values (${testId(320 + index)}, ${cased.id}, 'org', 'A', 'a')`);
        await write(sql`insert into claims (id, case_id, entity_id, text, confidence)
          values (${testId(330 + index)}, ${cased.id}, ${testId(320 + index)}, 'x', 'unverified')`);
        await write(sql`insert into evidence (id, case_id, kind, actor_id)
          values (${testId(340 + index)}, ${cased.id}, 'attestation', 'u')`);
        await write(sql`insert into claim_evidence (claim_id, case_id, evidence_id)
          values (${testId(330 + index)}, ${cased.id}, ${testId(340 + index)})`);
        await write(sql`insert into tasks (id, case_id, entity_id, title)
          values (${testId(350 + index)}, ${cased.id}, ${testId(320 + index)}, 'linked')`);
      })
    );
    await withSystemHistoryContext(db, async (tx) => {
      await prepareCasePurge(tx, gone.id);
      await tx.delete(cases).where(sql`${cases.id} = ${gone.id}`);
    });
    const rows = await history();
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((row) => row.caseId))).toEqual(new Set([keep.id]));
  });
});

describe("graph_history is append-only", () => {
  beforeEach(async () => {
    await resetTestDb();
    const cased = await seedCase(db);
    await write(
      sql`insert into tasks (id, case_id, title) values (${testId(340)}, ${cased.id}, 't')`
    );
  });

  it("the app role can only read it", async () => {
    const statements = [
      sql`insert into graph_history (case_id, kind, row_id, op, channel, after)
        select case_id, 'task', id, 'create', 'dossier', '{}'::jsonb from tasks`,
      sql`update graph_history set kind = 'claim'`,
      sql`delete from graph_history`,
      sql`truncate graph_history`,
      sql`truncate cases cascade`,
      sql`select public.graph_history_append(null, 'task', null, 'create', null, '{}'::jsonb)`,
    ];
    const states = await Promise.all(
      statements.map((statement) => sqlState(() => db.execute(statement)))
    );
    expect(states).toEqual(statements.map(() => "42501"));
    expect(await history()).toHaveLength(1);
  });

  it("refuses UPDATE, DELETE while the Case exists, and TRUNCATE, even for the owner", async () => {
    // restrict_violation
    expect(
      await sqlState(() => owner`update graph_history set kind = 'claim'`)
    ).toBe("23001");
    expect(await sqlState(() => owner`delete from graph_history`)).toBe(
      "23001"
    );
    expect(await sqlState(() => owner`truncate graph_history`)).toBe("23001");
    expect(await sqlState(() => owner`truncate cases cascade`)).toBe("23001");
    expect(await history()).toHaveLength(1);
  });

  it("admits only the vocabulary in kind, op and channel", async () => {
    const insert = (kind: string, op: string, channel: string) =>
      sqlState(
        () => owner`
          insert into graph_history (case_id, kind, row_id, op, channel, after)
          select id, ${kind}, ${testId(342)}, ${op}, ${channel}, '{}'::jsonb from cases limit 1`
      );
    // check_violation
    expect(await insert("nope", "create", "system")).toBe("23514");
    expect(await insert("task", "nope", "system")).toBe("23514");
    expect(await insert("task", "create", "nope")).toBe("23514");
    expect(await insert("task", "create", "system")).toBe("none");
  });

  it("allows TRUNCATE only when the transaction opts in (what `just wipe` does)", async () => {
    await owner
      .begin(async (tx) => {
        await tx`set local watchdog.allow_history_truncate = 'on'`;
        await tx`truncate cases cascade`;
        const [row] = await tx<
          { n: number }[]
        >`select count(*)::int as n from graph_history`;
        expect(row?.n).toBe(0);
        throw new Error("rollback");
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error) || error.message !== "rollback")
          throw error;
      });
    expect(await history()).toHaveLength(1);
  });

  it("cannot be dodged by shadowing a table the guard reads with a temp table", async () => {
    await owner
      .begin(async (tx) => {
        await tx`create temp table cases (id uuid)`;
        await tx`create temp table entities (id uuid, case_id uuid)`;
        await tx`set local search_path = pg_temp, public`;
        // The guard asks public.cases, not the temp table, so the Case still exists.
        expect(
          await sqlState(() =>
            tx.savepoint((attempt) => attempt`delete from public.graph_history`)
          )
        ).toBe("23001");
        // And recording still finds the real Case through public.entities.
        await tx`insert into public.tasks (id, case_id, title)
        select ${testId(341)}, case_id, 't2' from public.graph_history limit 1`;
        const [row] = await tx<
          { n: number }[]
        >`select count(*)::int as n from public.graph_history`;
        expect(row?.n).toBe(2);
        throw new Error("rollback");
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error) || error.message !== "rollback")
          throw error;
      });
  });
});
