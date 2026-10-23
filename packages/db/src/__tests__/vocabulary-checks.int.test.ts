import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { client } from "@watchdog/db";
import {
  expectPostgresRefusal,
  PG_CHECK_VIOLATION,
  seedAuthUser,
  seedCase,
  seedEntity,
  seedEvidence,
  withSystemTestTx,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import type { DbTx } from "../exec";
import { vocabChecks } from "../schema/vocab-checks";
import { insertRawRow, type RawRow } from "./helpers/raw-rows";

/*
 * Vocabulary CHECK constraints (#302). The constraint for each vocabulary column is generated from
 * the tuple in `@watchdog/schemas` (`vocabCheck`); these tests prove the database enforces what the
 * code says:
 *   - drift: the constraint Postgres holds names exactly the values the code lists, so a value
 *     added to a tuple without a migration fails here (and `pnpm check:migrations` fails too);
 *   - refusal: every constrained column refuses a value outside its tuple and accepts each value in it.
 */

const constraints = vocabChecks();
/** The application role cannot insert into `graph_history`: its values are tested as the owner. */
const insertable = constraints.filter(
  (entry) => entry.table !== "graph_history"
);

type Context = {
  caseId: string;
  entityId: string;
  peerId: string;
  userId: string;
};

const EMPTY_JSON = sql`'{}'::jsonb`;
const EMPTY_LIST = sql`'[]'::jsonb`;

/** One valid row of each table with a vocabulary column; `n` keeps natural keys apart. */
const VALID_ROWS: Record<string, (c: Context, n: number) => RawRow> = {
  entities: (c, n) => ({
    case_id: c.caseId,
    kind: "person",
    name: `Entity ${n}`,
    slug: `entity-${n}`,
  }),
  claims: (c, n) => ({
    entity_id: c.entityId,
    case_id: c.caseId,
    text: `claim ${n}`,
    confidence: "unverified",
  }),
  identifiers: (c, n) => ({
    entity_id: c.entityId,
    case_id: c.caseId,
    type: "email",
    value: `a${n}@example.invalid`,
    confidence: "unverified",
  }),
  edges: (c, n) => ({
    from_id: c.entityId,
    to_id: c.peerId,
    case_id: c.caseId,
    predicate: ["owns", "operates", "leads", "founded"][n % 4],
    confidence: "unverified",
  }),
  questions: (c, n) => ({
    entity_id: c.entityId,
    case_id: c.caseId,
    text: `question ${n}`,
  }),
  evidence: (c) => ({ case_id: c.caseId, kind: "attestation", actor_id: "a" }),
  // Not insertable by the application role (the triggers write it); the refusal and acceptance
  // of its values is tested as the owner in graph-history-triggers.int.test.ts.
  graph_history: (c) => ({
    case_id: c.caseId,
    kind: "task",
    row_id: c.entityId,
    op: "create",
    channel: "system",
    after: EMPTY_JSON,
  }),
  jobs: (c) => ({
    case_id: c.caseId,
    capability_id: "network.dns.lookup",
    input: EMPTY_JSON,
    actor_id: "a",
  }),
  proposals: (c) => ({ case_id: c.caseId, patch: EMPTY_LIST }),
  tasks: (c, n) => ({ case_id: c.caseId, title: `task ${n}` }),
  graph_writes: (c) => ({
    case_id: c.caseId,
    actor_id: "a",
    channel: "agent_write",
    confidence: "unverified",
    patch: EMPTY_LIST,
  }),
  playbook_runs: (c) => ({
    case_id: c.caseId,
    playbook_id: "p",
    seed: EMPTY_JSON,
    actor_id: "a",
  }),
  activity: (c) => ({ case_id: c.caseId, kind: "task", action: "created" }),
  case_deletion_records: (c) => ({
    case_id: c.caseId,
    organization_id: "org-vocab",
    case_name: "Case",
    case_slug: "case",
    event: "deleted",
  }),
  job_start_counters: (_c, n) => ({
    scope: "organization",
    subject_id: `subject-${n}`,
    window_start: "2026-01-01T00:00:00Z",
    count: 1,
  }),
  auth_event: (c, n) => ({
    id: `event-${n}`,
    user_id: c.userId,
    kind: "session.created",
  }),
};

/** Columns that may be NULL: the check must let NULL through. */
const NULLABLE = new Set([
  "claims.retract_kind",
  "playbook_runs.outcome",
  "tasks.priority",
]);

async function context(tx: DbTx): Promise<Context> {
  const cased = await seedCase(tx);
  const entity = await seedEntity(tx, cased.id, { id: testId(40) });
  const peer = await seedEntity(tx, cased.id, {
    id: testId(41),
    slug: "peer",
    name: "Peer",
  });
  await seedEvidence(tx, cased.id);
  const userId = "vocab-user";
  await seedAuthUser(tx, {
    id: userId,
    name: "Vocab",
    email: "vocab@example.invalid",
  });
  return {
    caseId: cased.id,
    entityId: entity.id,
    peerId: peer.id,
    userId,
  };
}

/** The strings a CHECK compares against, read back from Postgres (`pg_get_constraintdef`). */
function quotedValues(definition: string): string[] {
  return [...definition.matchAll(/'((?:[^']|'')*)'/g)].map((match) =>
    (match[1] ?? "").replaceAll("''", "'")
  );
}

describe("vocabulary CHECK constraints: drift", () => {
  it("covers every vocabulary column of the schema", () => {
    expect(
      constraints.map((entry) => `${entry.table}.${entry.column}`).sort()
    ).toEqual([
      "activity.action",
      "activity.kind",
      "auth_event.kind",
      "case_deletion_records.event",
      "claims.class",
      "claims.confidence",
      "claims.retract_kind",
      "edges.confidence",
      "edges.predicate",
      "entities.kind",
      "evidence.kind",
      "graph_history.channel",
      "graph_history.kind",
      "graph_history.op",
      "graph_writes.channel",
      "graph_writes.confidence",
      "identifiers.confidence",
      "identifiers.status",
      "identifiers.type",
      "job_start_counters.scope",
      "jobs.error_code",
      "jobs.status",
      "playbook_runs.outcome",
      "playbook_runs.status",
      "proposals.status",
      "questions.status",
      "tasks.priority",
      "tasks.status",
    ]);
  });

  it("has a valid-row builder for every constrained table", () => {
    for (const { table } of constraints) {
      expect(VALID_ROWS[table], `a valid ${table} row`).toBeDefined();
    }
  });

  it.each(constraints)(
    "the database constraint $constraint lists exactly the values in the code",
    async ({ schema, table, constraint, values }) => {
      const rows = await client<{ definition: string }[]>`
        select pg_get_constraintdef(c.oid) as definition
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where c.conname = ${constraint} and c.contype = 'c'
          and t.relname = ${table} and n.nspname = ${schema}`;
      expect(rows, `constraint ${constraint} exists`).toHaveLength(1);
      expect(quotedValues(rows[0]?.definition ?? "").sort()).toEqual(
        [...values].sort()
      );
    }
  );

  it("holds no vocabulary constraint the code does not declare", async () => {
    const rows = await client<{ conname: string }[]>`
      select c.conname from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
      where c.contype = 'c' and n.nspname in ('public', 'auth') and c.conname like '%\\_vocab'
      order by c.conname`;
    expect(rows.map((row) => row.conname)).toEqual(
      constraints.map((entry) => entry.constraint).sort()
    );
  });
});

describe("vocabulary CHECK constraints: refusal", () => {
  it.each(insertable)(
    "$constraint refuses a value outside the vocabulary",
    async ({ schema, table, column, constraint }) => {
      await withSystemTestTx(async (tx) => {
        const c = await context(tx);
        const base = VALID_ROWS[table];
        if (!base) throw new Error(`no valid ${table} row`);
        await expectPostgresRefusal(
          insertRawRow(
            tx,
            table,
            { ...base(c, 1), [column]: "not_a_value" },
            schema
          ),
          { code: PG_CHECK_VIOLATION, constraint }
        );
      });
    }
  );

  it.each(insertable)(
    "$constraint accepts every value in the vocabulary",
    async ({ schema, table, column, values }) => {
      await withSystemTestTx(async (tx) => {
        const c = await context(tx);
        const base = VALID_ROWS[table];
        if (!base) throw new Error(`no valid ${table} row`);
        let n = 1;
        for (const value of [
          ...values,
          ...(NULLABLE.has(`${table}.${column}`) ? [null] : []),
        ]) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- rows go in one at a time
          await insertRawRow(
            tx,
            table,
            { ...base(c, n), [column]: value },
            schema
          );
          n += 1;
        }
      });
    }
  );
});
