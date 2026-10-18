import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { invariantRules } from "../invariants";
import { migrationFailureMessage } from "../migrate";
import { vocabChecks } from "../schema/vocab-checks";
import {
  createScratchDatabase,
  queryScratch,
  tryScratch,
  type ScratchDatabase,
} from "./helpers/scratch-database";

/**
 * Migrations 0023 to 0027 (#302) against the frozen performance seed, in a PRIVATE scratch
 * database: the seed is loaded at the schema of migration 0022 (its own frozen copy, so the live
 * seed can move on), then each migration is applied in turn and its effect asserted.
 *
 * 0023 adds, 0024 backfills, 0025 reports (and refuses while any row would break a rule),
 * 0026 constrains, 0027 drops the JSON columns.
 */
const SEED_0022 = path.resolve(
  import.meta.dirname,
  "fixtures/perf-seed-0022.sql"
);
const MIGRATIONS = path.resolve(import.meta.dirname, "../../drizzle");

/** 1/20th of the audit's shape: 50 Cases, 12 Entities per Case, 20 Evidence per Case. */
const SEED_DIV = "20";

/** What the operator is shown: the database's own message, not the statement drizzle wraps it in. */
function errorText(error: Error | undefined): string {
  return error === undefined ? "" : migrationFailureMessage(error);
}

async function count(db: ScratchDatabase, statement: string): Promise<number> {
  const [row] = await queryScratch<{ n: string }>(db, statement);
  return Number(row?.n);
}

/** The statements of a migration file, as the migrator splits them. */
function statementsOf(file: string): string[] {
  return readFileSync(path.join(MIGRATIONS, file), "utf-8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");
}

const TABLES_WITH_CASE_ID_FROM_ENTITY = [
  "claims",
  "identifiers",
  "events",
  "questions",
] as const;

describe("migrations 0023-0027 on the frozen performance seed", () => {
  let db: ScratchDatabase;
  let acceptedProposals = 0;
  let jobsWithEvidence = 0;
  let entityCount = 0;
  let foreignEntities = 0;

  beforeAll(async () => {
    db = await createScratchDatabase();
    await db.migrateThrough(22);
    db.runSqlFile(SEED_0022, { div: SEED_DIV });

    // The seed has no Evidence ids on Proposals or Jobs; give some, in the shapes real rows have:
    // out of order, a repeat in upper case with spaces, and a Job whose list is NULL.
    await queryScratch(
      db,
      `WITH ev AS (
         SELECT id, case_id, row_number() OVER (PARTITION BY case_id ORDER BY id) AS rn FROM evidence
       )
       UPDATE proposals p SET evidence_ids = jsonb_build_array(
         (SELECT id::text FROM ev WHERE ev.case_id = p.case_id AND rn = 2),
         (SELECT id::text FROM ev WHERE ev.case_id = p.case_id AND rn = 1),
         (SELECT ' ' || upper(id::text) || ' ' FROM ev WHERE ev.case_id = p.case_id AND rn = 2))
       WHERE p.status = 'accepted'`
    );
    await queryScratch(
      db,
      `WITH ev AS (
         SELECT id, case_id, row_number() OVER (PARTITION BY case_id ORDER BY id) AS rn FROM evidence
       )
       UPDATE jobs j SET evidence_ids = jsonb_build_array(
         (SELECT id::text FROM ev WHERE ev.case_id = j.case_id AND rn = 3))
       WHERE j.status = 'succeeded' AND abs(hashtext(j.id::text)) % 7 = 0`
    );
    acceptedProposals = await count(
      db,
      "SELECT count(*) AS n FROM proposals WHERE status = 'accepted'"
    );
    jobsWithEvidence = await count(
      db,
      "SELECT count(*) AS n FROM jobs WHERE evidence_ids IS NOT NULL"
    );
    entityCount = await count(db, "SELECT count(*) AS n FROM entities");
    foreignEntities = await count(
      db,
      "SELECT count(*) AS n FROM entities WHERE kind <> 'person'"
    );
  }, 120_000);

  afterAll(async () => {
    await db.drop();
  });

  it("loads a seed with rows in every table the migrations touch", () => {
    expect(acceptedProposals).toBeGreaterThan(100);
    expect(jobsWithEvidence).toBeGreaterThan(50);
    expect(entityCount).toBe(50 * 12);
    // The seed's entity kinds are mostly outside the vocabulary: 0025 must catch them.
    expect(foreignEntities).toBeGreaterThan(0);
  });

  it("the violation rules list the seed's bad rows on the unmigrated schema", async () => {
    // What an operator runs (scripts/invariant-violations.ts) when 0025 refuses: no new column needed.
    const found: Record<string, number> = {};
    for (const rule of invariantRules()) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one rule at a time
      const rows = await queryScratch(db, rule.query);
      if (rows.length > 0) found[rule.name] = rows.length;
    }
    expect(found).toEqual({ "entities.kind": foreignEntities });
  });

  it("0023 adds nullable case ids and empty link tables, and changes no row", async () => {
    await db.migrateThrough(23);
    const columns = await queryScratch<{
      table_name: string;
      nullable: string;
    }>(
      db,
      `SELECT table_name, is_nullable AS nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'case_id'
         AND table_name IN ('claims','identifiers','events','questions','edges',
                            'claim_evidence','identifier_evidence','edge_evidence')`
    );
    expect(columns).toHaveLength(8);
    expect(columns.every((column) => column.nullable === "YES")).toBe(true);
    expect(await count(db, "SELECT count(*) AS n FROM proposal_evidence")).toBe(
      0
    );
    expect(await count(db, "SELECT count(*) AS n FROM job_evidence")).toBe(0);
    expect(
      await count(db, "SELECT count(*) AS n FROM claims WHERE case_id IS NULL")
    ).toBeGreaterThan(0);
  });

  it("0024 gives every row its Case and links the Evidence ids, in order, without duplicates", async () => {
    await db.migrateThrough(24);
    for (const table of TABLES_WITH_CASE_ID_FROM_ENTITY) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one table at a time keeps failures readable
      const unfilled = await count(
        db,
        `SELECT count(*) AS n FROM ${table} t JOIN entities e ON e.id = t.entity_id
         WHERE t.case_id IS DISTINCT FROM e.case_id`
      );
      expect(unfilled, `${table} rows without their Entity's Case`).toBe(0);
    }
    expect(
      await count(
        db,
        `SELECT count(*) AS n FROM edges ed JOIN entities e ON e.id = ed.from_id
         WHERE ed.case_id IS DISTINCT FROM e.case_id`
      )
    ).toBe(0);

    // Two distinct Evidence ids per accepted Proposal (the third entry repeats the first).
    expect(await count(db, "SELECT count(*) AS n FROM proposal_evidence")).toBe(
      acceptedProposals * 2
    );
    expect(await count(db, "SELECT count(*) AS n FROM job_evidence")).toBe(
      jobsWithEvidence
    );
    const [ordered] = await queryScratch<{ ids: string[]; expected: string[] }>(
      db,
      `SELECT array(SELECT evidence_id::text FROM proposal_evidence pe
                    WHERE pe.proposal_id = p.id ORDER BY position) AS ids,
              ARRAY[p.evidence_ids->>0, p.evidence_ids->>1] AS expected
       FROM proposals p WHERE p.status = 'accepted' ORDER BY p.id LIMIT 1`
    );
    expect(ordered?.ids).toEqual(ordered?.expected);
    // The JSON stays until 0027: the backfill copies, it does not move.
    expect(
      await count(
        db,
        "SELECT count(*) AS n FROM proposals WHERE jsonb_array_length(evidence_ids) > 0"
      )
    ).toBe(acceptedProposals);
  });

  it("0024 is idempotent: running its statements again changes nothing", async () => {
    const before = await count(
      db,
      `SELECT (SELECT count(*) FROM proposal_evidence) + (SELECT count(*) FROM job_evidence) AS n`
    );
    for (const statement of statementsOf(
      "0024_backfill_case_ids_and_evidence_links.sql"
    )) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- statements run in file order
      expect(await tryScratch(db, statement)).toBeUndefined();
    }
    expect(
      await count(
        db,
        `SELECT (SELECT count(*) FROM proposal_evidence) + (SELECT count(*) FROM job_evidence) AS n`
      )
    ).toBe(before);
  });

  it("0025 refuses while stored rows break a rule, names each rule, and changes nothing", async () => {
    // The seed's own entity kinds, plus one row of each kind of structural violation.
    await queryScratch(
      db,
      `INSERT INTO claim_evidence (claim_id, evidence_id, case_id)
       SELECT c.id, e.id, c.case_id FROM claims c
       JOIN evidence e ON e.case_id <> c.case_id
       ORDER BY c.id, e.id LIMIT 1`
    );
    await queryScratch(
      db,
      `UPDATE edges SET to_id = (
         SELECT en.id FROM entities en WHERE en.case_id <> edges.case_id ORDER BY en.id LIMIT 1)
       WHERE id = (SELECT id FROM edges ORDER BY id LIMIT 1)`
    );
    await queryScratch(
      db,
      `UPDATE proposals SET evidence_ids = '["00000000-0000-4000-8000-00000000dead"]'::jsonb
       WHERE id = (SELECT id FROM proposals WHERE status = 'pending' ORDER BY id LIMIT 1)`
    );
    await queryScratch(
      db,
      `UPDATE evidence SET entity_id = (
         SELECT en.id FROM entities en WHERE en.case_id <> evidence.case_id ORDER BY en.id LIMIT 1)
       WHERE id = (SELECT id FROM evidence ORDER BY id LIMIT 1)`
    );
    await queryScratch(
      db,
      `INSERT INTO tasks (case_id, entity_id, title)
       SELECT a.id, e.id, 'cross-case task' FROM cases a
       JOIN entities e ON e.case_id <> a.id ORDER BY a.id, e.id LIMIT 1`
    );

    const migrationsBefore = await count(
      db,
      "SELECT count(*) AS n FROM drizzle.__drizzle_migrations"
    );
    const failure = await db.migrateThrough(25).then(
      () => undefined,
      (error: unknown) => (error instanceof Error ? error : new Error("?"))
    );
    const message = errorText(failure);
    expect(message).toContain("Database invariants (#302)");
    expect(message).toContain(`entities.kind: ${foreignEntities} row(s)`);
    for (const rule of [
      "claim_evidence.cross_case",
      "edges.cross_case",
      "proposals.evidence_ids",
      "evidence.entity_id",
      "tasks.entity_id",
    ]) {
      expect(message, `the report names ${rule}`).toContain(
        `- ${rule}: 1 row(s)`
      );
    }
    // Rules that hold are not listed.
    expect(message).not.toContain("jobs.evidence_ids");
    expect(message).not.toContain("claims.confidence");
    expect(message).toContain("To fix:");
    expect(
      await count(db, "SELECT count(*) AS n FROM drizzle.__drizzle_migrations")
    ).toBe(migrationsBefore);
  });

  it("0025 through 0027 apply once the listed rows are repaired, and the constraints hold", async () => {
    await queryScratch(
      db,
      `UPDATE entities SET kind = CASE kind
         WHEN 'organization' THEN 'org' WHEN 'place' THEN 'infra' WHEN 'asset' THEN 'infra'
         ELSE kind END`
    );
    await queryScratch(db, "DELETE FROM tasks");
    await queryScratch(
      db,
      `DELETE FROM claim_evidence ce USING claims c, evidence e
       WHERE c.id = ce.claim_id AND e.id = ce.evidence_id AND e.case_id <> c.case_id`
    );
    await queryScratch(
      db,
      `UPDATE edges SET to_id = (
         SELECT en.id FROM entities en WHERE en.case_id = edges.case_id AND en.id <> edges.from_id
         ORDER BY en.id LIMIT 1)
       WHERE to_id IN (SELECT id FROM entities en WHERE en.case_id <> edges.case_id)`
    );
    await queryScratch(
      db,
      `UPDATE proposals SET evidence_ids = '[]'::jsonb
       WHERE evidence_ids = '["00000000-0000-4000-8000-00000000dead"]'::jsonb`
    );
    await queryScratch(
      db,
      "UPDATE evidence SET entity_id = NULL WHERE entity_id IS NOT NULL"
    );

    await db.migrateThrough(27);

    const unvalidated = await queryScratch<{ conname: string }>(
      db,
      `SELECT conname FROM pg_constraint
       WHERE connamespace IN ('public'::regnamespace, 'auth'::regnamespace) AND NOT convalidated`
    );
    expect(unvalidated).toEqual([]);
    expect(
      await count(
        db,
        `SELECT count(*) AS n FROM pg_constraint
         WHERE connamespace IN ('public'::regnamespace, 'auth'::regnamespace) AND conname LIKE '%\\_vocab'`
      )
    ).toBe(vocabChecks().length);
    expect(
      await count(
        db,
        `SELECT count(*) AS n FROM pg_constraint
         WHERE connamespace = 'public'::regnamespace AND contype = 'f'
           AND conname LIKE '%\\_case\\_id\\_fk'`
      )
    ).toBe(18);
    expect(
      await count(
        db,
        `SELECT count(*) AS n FROM information_schema.columns
         WHERE table_schema = 'public' AND column_name = 'evidence_ids'`
      )
    ).toBe(0);
    expect(await count(db, "SELECT count(*) AS n FROM proposal_evidence")).toBe(
      acceptedProposals * 2
    );
    expect(await count(db, "SELECT count(*) AS n FROM job_evidence")).toBe(
      jobsWithEvidence
    );
    // Spot checks that the constraints are live on the migrated seed.
    const crossCase = await tryScratch(
      db,
      `INSERT INTO claim_evidence (claim_id, evidence_id, case_id)
       SELECT c.id, e.id, c.case_id FROM claims c JOIN evidence e ON e.case_id <> c.case_id LIMIT 1`
    );
    expect(errorText(crossCase)).toContain(
      "claim_evidence_evidence_id_case_id_fk"
    );
    const badKind = await tryScratch(
      db,
      "UPDATE entities SET kind = 'organization'"
    );
    expect(errorText(badKind)).toContain("entities_kind_vocab");
  });
});

describe("migrating from 0022 in one go", () => {
  let db: ScratchDatabase;

  beforeAll(async () => {
    db = await createScratchDatabase();
    await db.migrateThrough(22);
  }, 60_000);

  afterAll(async () => {
    await db.drop();
  });

  it("leaves the database exactly as it was when the report finds a bad row", async () => {
    await queryScratch(
      db,
      `INSERT INTO cases (id, name, slug, organization_id)
       VALUES ('00000000-0000-4000-8000-0000000000c1', 'Case', 'case', 'org-1')`
    );
    await queryScratch(
      db,
      `INSERT INTO entities (case_id, kind, name, slug)
       VALUES ('00000000-0000-4000-8000-0000000000c1', 'organization', 'Bad', 'bad')`
    );
    const failure = await db.migrateThrough(27).then(
      () => undefined,
      (error: unknown) => (error instanceof Error ? error : new Error("?"))
    );
    expect(errorText(failure)).toContain("entities.kind: 1 row(s), e.g.");
    // The migrator applies everything pending in one transaction: no column, no table, no record.
    expect(
      await count(
        db,
        `SELECT count(*) AS n FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'claims' AND column_name = 'case_id'`
      )
    ).toBe(0);
    expect(
      await count(
        db,
        `SELECT count(*) AS n FROM information_schema.tables WHERE table_name = 'job_evidence'`
      )
    ).toBe(0);
    expect(
      await count(db, "SELECT count(*) AS n FROM drizzle.__drizzle_migrations")
    ).toBe(23);
  });

  it("applies cleanly once the row is fixed", async () => {
    await queryScratch(db, "UPDATE entities SET kind = 'org'");
    await db.migrateThrough(27);
    expect(
      await count(db, "SELECT count(*) AS n FROM drizzle.__drizzle_migrations")
    ).toBe(28);
  });
});
