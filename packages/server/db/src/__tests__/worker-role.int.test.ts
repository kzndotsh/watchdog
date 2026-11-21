import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { expectPostgresRefusal, testDb as db } from "#test-db";

import { APP_ROLE, WORKER_ROLE } from "../app-role.ts";
import { workerRoleDb } from "../organization-scope.ts";

/**
 * Issue #720: the worker logs in as `watchdog_worker`, and an API-key request in the web process
 * switches to it (`workerRoleDb`, a transaction-local role change). It has the application role's
 * privileges except any write to the Graph. Run against the test database the way
 * `scripts/ensure-test-db.sh` makes it (both roles created by the init, granted by the migrator).
 */

/** The Graph: the tables `graph_history` records, and their Evidence links. */
const GRAPH_TABLES = [
  "entities",
  "edges",
  "identifiers",
  "claims",
  "events",
  "questions",
  "tasks",
  "claim_evidence",
  "identifier_evidence",
  "edge_evidence",
] as const;

/** Other tables only a person's decision writes: Triage's rejected-Proposal memory. */
const PERSON_ONLY_TABLES = ["finding_suppressions"] as const;

const worker = workerRoleDb(db);

/** The worker login, as the database init creates it (the same local password as the app role). */
const workerUrl = (() => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  url.username = WORKER_ROLE;
  return url.toString();
})();
const workerLogin = postgres(workerUrl, {
  max: 1,
  idle_timeout: 5,
  onnotice: () => {},
});

afterAll(async () => {
  await workerLogin.end({ timeout: 5 });
});

/** 42501 = insufficient_privilege. */
const denied = { code: "42501" };

type Privileges = { name: string; select: boolean; insert: boolean };

/** What `role` may do to every table of `schema`. */
async function privileges(schema: string, role: string) {
  const rows = await db.execute<{
    name: string;
    select: boolean;
    insert: boolean;
    update: boolean;
    delete: boolean;
  }>(
    sql`select c.relname::text as name,
               has_table_privilege(${role}, c.oid, 'SELECT') as select,
               has_table_privilege(${role}, c.oid, 'INSERT') as insert,
               has_table_privilege(${role}, c.oid, 'UPDATE') as update,
               has_table_privilege(${role}, c.oid, 'DELETE') as delete
          from pg_class c
         where c.relnamespace = ${schema}::regnamespace and c.relkind in ('r', 'p')
         order by 1`
  );
  return [...rows];
}

describe("the worker role", () => {
  it("is a plain login that owns nothing", async () => {
    const [role] = await db.execute<Record<string, boolean>>(
      sql`select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication,
                 exists (select 1 from pg_class c where c.relowner = r.oid) as owns
            from pg_roles r where rolname = ${WORKER_ROLE}`
    );
    expect(role).toEqual({
      rolcanlogin: true,
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolbypassrls: false,
      rolreplication: false,
      owns: false,
    });
  });

  it("is what the worker logs in as, and that login writes no Graph table", async () => {
    const [me] = await workerLogin`select current_user as who`;
    expect(me?.who).toBe(WORKER_ROLE);
    await expect(
      workerLogin`insert into public.entities default values`
    ).rejects.toMatchObject(denied);
  });

  it("can be switched to by the application role, which gains none of its privileges", async () => {
    const [membership] = await db.execute<{ set: boolean; usage: boolean }>(
      sql`select pg_has_role(${APP_ROLE}, ${WORKER_ROLE}, 'SET') as set,
                 pg_has_role(${APP_ROLE}, ${WORKER_ROLE}, 'USAGE') as usage`
    );
    expect(membership).toEqual({ set: true, usage: false });
    const [me] = await worker.execute<{ who: string; session: string }>(
      sql`select current_user as who, session_user as session`
    );
    expect(me).toEqual({ who: WORKER_ROLE, session: APP_ROLE });
    // Transaction-local: the pooled connection is the application role again afterwards.
    const [after] = await db.execute<{ who: string }>(
      sql`select current_user as who`
    );
    expect(after?.who).toBe(APP_ROLE);
  });

  it.each([...GRAPH_TABLES, ...PERSON_ONLY_TABLES])(
    "reads %s and may not insert, update or delete a row of it",
    async (table) => {
      await worker.execute(sql.raw(`select count(*) from public.${table}`));
      for (const statement of [
        `insert into public.${table} default values`,
        `update public.${table} set case_id = case_id where false`,
        `delete from public.${table} where false`,
        `truncate public.${table}`,
      ]) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one refusal at a time, each named on failure
        await expectPostgresRefusal(worker.execute(sql.raw(statement)), denied);
      }
    }
  );

  it("has the application role's privileges on every other public table", async () => {
    const app = await privileges("public", APP_ROLE);
    const machine = await privileges("public", WORKER_ROLE);
    const graphless = new Set<string>([...GRAPH_TABLES, ...PERSON_ONLY_TABLES]);
    // A table the worker reads only: what the application role has, without the writes.
    const expected = app.map((row) =>
      graphless.has(row.name)
        ? { ...row, insert: false, update: false, delete: false }
        : row
    );
    expect(machine).toEqual(expected);
    for (const name of graphless) {
      expect(app.find((row) => row.name === name)?.select).toBe(true);
    }
  });

  it("only reads Better Auth's tables", async () => {
    const machine = await privileges("auth", WORKER_ROLE);
    expect(machine.length).toBeGreaterThan(0);
    expect(
      machine.filter((row) => row.insert || row.update || row.delete)
    ).toEqual([]);
    expect(machine.every((row: Privileges) => row.select)).toBe(true);
    await worker.execute(sql`select count(*) from auth.organization`);
    await expectPostgresRefusal(
      worker.execute(sql`update auth.organization set name = name where false`),
      denied
    );
  });

  it("writes pg-boss's tables, which a Job's enqueue and the worker's queue need", async () => {
    const app = await privileges("pgboss", APP_ROLE);
    expect(await privileges("pgboss", WORKER_ROLE)).toEqual(app);
  });
});
