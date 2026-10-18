import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { CaseId } from "@watchdog/schemas/shared";
import {
  expectPostgresRefusal,
  PG_FOREIGN_KEY_VIOLATION,
  PG_RESTRICT_VIOLATION,
  seedCase,
  seedEntity,
  seedEvidence,
  seedIdentifier,
  seedJob,
  seedProposal,
  withSystemTestTx,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import type { DbTx } from "../exec";
import { claimsRepo } from "../repos/claims.repo";
import { edgesRepo } from "../repos/edges.repo";
import { insertRawRow, type RawRow } from "./helpers/raw-rows";

/*
 * Same-Case integrity (#302): every row that hangs off an Entity, every Edge, and every link to
 * Evidence carries the Case id, and composite foreign keys `(x_id, case_id)` into
 * `unique (id, case_id)` make Postgres refuse a row whose two ends sit in different Cases.
 */

type Fixtures = {
  caseA: CaseId;
  caseB: CaseId;
  entityA: string;
  entityA2: string;
  entityB: string;
  evidenceA: string;
  evidenceB: string;
  claimA: string;
  identifierA: string;
  edgeA: string;
  proposalA: string;
  jobA: string;
};

/** Case A holds a Claim, Identifier, Edge, Proposal and Job; Case B holds an Entity and Evidence. */
async function fixtures(tx: DbTx): Promise<Fixtures> {
  const a = await seedCase(tx, { slug: "case-a" });
  const b = await seedCase(tx, { slug: "case-b" });
  const entityA = await seedEntity(tx, a.id, { id: testId(50), slug: "a1" });
  const entityA2 = await seedEntity(tx, a.id, { id: testId(51), slug: "a2" });
  const entityB = await seedEntity(tx, b.id, { id: testId(52), slug: "b1" });
  const evidenceA = await seedEvidence(tx, a.id);
  const evidenceB = await seedEvidence(tx, b.id);
  const claim = await claimsRepo.create(tx, {
    entityId: entityA.id,
    caseId: a.id,
    text: "a claim",
    class: "observation",
    confidence: "unverified",
  });
  const identifier = await seedIdentifier(tx, entityA.id, {
    type: "email",
    value: "a@example.invalid",
  });
  const edge = await edgesRepo.create(tx, {
    fromId: entityA.id,
    toId: entityA2.id,
    caseId: a.id,
    predicate: "same_as",
    confidence: "unverified",
    notes: null,
  });
  const proposal = await seedProposal(tx, a.id, []);
  const job = await seedJob(tx, a.id);
  if (!claim || !edge) throw new Error("fixture rows");
  return {
    caseA: a.id,
    caseB: b.id,
    entityA: entityA.id,
    entityA2: entityA2.id,
    entityB: entityB.id,
    evidenceA: evidenceA.id,
    evidenceB: evidenceB.id,
    claimA: claim.id,
    identifierA: identifier.id,
    edgeA: edge.id,
    proposalA: proposal.id,
    jobA: job.id,
  };
}

type Refusal = {
  name: string;
  constraint: string;
  /** The row Postgres must refuse. */
  row: (f: Fixtures) => { table: string; row: RawRow };
};

const REFUSALS: Refusal[] = [
  // A link whose Evidence is in another Case.
  ...(
    [
      ["claim_evidence", "claim_id", (f: Fixtures) => f.claimA],
      ["identifier_evidence", "identifier_id", (f: Fixtures) => f.identifierA],
      ["edge_evidence", "edge_id", (f: Fixtures) => f.edgeA],
      ["proposal_evidence", "proposal_id", (f: Fixtures) => f.proposalA],
      ["job_evidence", "job_id", (f: Fixtures) => f.jobA],
    ] as const
  ).flatMap(([table, key, parent]): Refusal[] => {
    const extra = table === "proposal_evidence" || table === "job_evidence";
    const withPosition = (row: RawRow): RawRow =>
      extra ? { ...row, position: 0 } : row;
    return [
      {
        name: `${table} refuses Evidence from another Case`,
        constraint: `${table}_evidence_id_case_id_fk`,
        row: (f) => ({
          table,
          row: withPosition({
            [key]: parent(f),
            evidence_id: f.evidenceB,
            case_id: f.caseA,
          }),
        }),
      },
      {
        name: `${table} refuses a parent from another Case`,
        constraint: `${table}_${key}_case_id_fk`,
        row: (f) => ({
          table,
          row: withPosition({
            [key]: parent(f),
            evidence_id: f.evidenceB,
            case_id: f.caseB,
          }),
        }),
      },
    ];
  }),
  // An Edge with an endpoint in another Case.
  {
    name: "edges refuses a to-end in another Case",
    constraint: "edges_to_id_case_id_fk",
    row: (f) => ({
      table: "edges",
      row: {
        from_id: f.entityA,
        to_id: f.entityB,
        case_id: f.caseA,
        predicate: "owns",
        confidence: "unverified",
      },
    }),
  },
  {
    name: "edges refuses a from-end in another Case",
    constraint: "edges_from_id_case_id_fk",
    row: (f) => ({
      table: "edges",
      row: {
        from_id: f.entityB,
        to_id: f.entityA,
        case_id: f.caseA,
        predicate: "owns",
        confidence: "unverified",
      },
    }),
  },
  // A row on an Entity that names another Case.
  {
    name: "claims refuses a Case other than its Entity's",
    constraint: "claims_entity_id_case_id_fk",
    row: (f) => ({
      table: "claims",
      row: {
        entity_id: f.entityB,
        case_id: f.caseA,
        text: "x",
        confidence: "unverified",
      },
    }),
  },
  {
    name: "identifiers refuses a Case other than its Entity's",
    constraint: "identifiers_entity_id_case_id_fk",
    row: (f) => ({
      table: "identifiers",
      row: {
        entity_id: f.entityB,
        case_id: f.caseA,
        type: "email",
        value: "x@example.invalid",
        confidence: "unverified",
      },
    }),
  },
  {
    name: "events refuses a Case other than its Entity's",
    constraint: "events_entity_id_case_id_fk",
    row: (f) => ({
      table: "events",
      row: { entity_id: f.entityB, case_id: f.caseA, when: "2024", what: "x" },
    }),
  },
  {
    name: "questions refuses a Case other than its Entity's",
    constraint: "questions_entity_id_case_id_fk",
    row: (f) => ({
      table: "questions",
      row: { entity_id: f.entityB, case_id: f.caseA, text: "x" },
    }),
  },
  // An optional Entity of another Case.
  {
    name: "evidence refuses an Entity of another Case",
    constraint: "evidence_entity_id_case_id_fk",
    row: (f) => ({
      table: "evidence",
      row: {
        case_id: f.caseA,
        entity_id: f.entityB,
        kind: "attestation",
        actor_id: "a",
      },
    }),
  },
  {
    name: "tasks refuses an Entity of another Case",
    constraint: "tasks_entity_id_case_id_fk",
    row: (f) => ({
      table: "tasks",
      row: { case_id: f.caseA, entity_id: f.entityB, title: "x" },
    }),
  },
];

describe("same-Case foreign keys: refusal", () => {
  it.each(REFUSALS)("$name", async ({ constraint, row }) => {
    await withSystemTestTx(async (tx) => {
      const f = await fixtures(tx);
      const { table, row: values } = row(f);
      await expectPostgresRefusal(insertRawRow(tx, table, values), {
        code: PG_FOREIGN_KEY_VIOLATION,
        constraint,
      });
    });
  });

  it("accepts the same links when both ends are in the Case", async () => {
    await withSystemTestTx(async (tx) => {
      const f = await fixtures(tx);
      const evidenceA2 = await seedEvidence(tx, f.caseA);
      for (const [table, key, parent, extra] of [
        ["claim_evidence", "claim_id", f.claimA, {}],
        ["identifier_evidence", "identifier_id", f.identifierA, {}],
        ["edge_evidence", "edge_id", f.edgeA, {}],
        ["proposal_evidence", "proposal_id", f.proposalA, { position: 0 }],
        ["job_evidence", "job_id", f.jobA, { position: 0 }],
      ] as const) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one link table at a time
        await insertRawRow(tx, table, {
          [key]: parent,
          evidence_id: evidenceA2.id,
          case_id: f.caseA,
          ...extra,
        });
      }
      const linked = await tx.execute(
        sql`select count(*)::int as n from job_evidence where evidence_id = ${evidenceA2.id}`
      );
      expect(linked[0]?.n).toBe(1);
    });
  });
});

describe("same-Case foreign keys: deleting what a row points at", () => {
  it("clears an optional Entity but keeps the row's Case id", async () => {
    await withSystemTestTx(async (tx) => {
      const f = await fixtures(tx);
      const attached = await seedEvidence(tx, f.caseA, { entityId: f.entityA });
      await insertRawRow(tx, "tasks", {
        case_id: f.caseA,
        entity_id: f.entityA,
        title: "attached",
      });
      await tx.execute(sql`delete from entities where id = ${f.entityA}`);
      const rows = await tx.execute(
        sql`select e.entity_id as evidence_entity, e.case_id::text as evidence_case,
                   t.entity_id as task_entity, t.case_id::text as task_case
            from evidence e, tasks t where e.id = ${attached.id}`
      );
      expect(rows[0]).toEqual({
        evidence_entity: null,
        evidence_case: f.caseA,
        task_entity: null,
        task_case: f.caseA,
      });
    });
  });

  it("removes the Claim, Identifier and Edge rows with their Entity, links included", async () => {
    await withSystemTestTx(async (tx) => {
      const f = await fixtures(tx);
      await insertRawRow(tx, "claim_evidence", {
        claim_id: f.claimA,
        evidence_id: f.evidenceA,
        case_id: f.caseA,
      });
      await tx.execute(sql`delete from entities where id = ${f.entityA}`);
      const left = await tx.execute(
        sql`select (select count(*) from claims where id = ${f.claimA})::int
              + (select count(*) from identifiers where id = ${f.identifierA})::int
              + (select count(*) from edges where id = ${f.edgeA})::int
              + (select count(*) from claim_evidence where claim_id = ${f.claimA})::int as n`
      );
      expect(left[0]?.n).toBe(0);
    });
  });

  it.each([
    ["claim_evidence", "claim_id", "claimA"],
    ["identifier_evidence", "identifier_id", "identifierA"],
    ["edge_evidence", "edge_id", "edgeA"],
  ] as const)(
    "drops %s links with their Evidence (a hard delete only happens with a Case)",
    async (table, key, parent) => {
      await withSystemTestTx(async (tx) => {
        const f = await fixtures(tx);
        await insertRawRow(tx, table, {
          [key]: f[parent],
          evidence_id: f.evidenceA,
          case_id: f.caseA,
        });
        await tx.execute(sql`delete from evidence where id = ${f.evidenceA}`);
        const left = await tx.execute(
          sql`select count(*)::int as n from ${sql.identifier(table)} where ${sql.identifier(key)} = ${f[parent]}`
        );
        expect(left[0]?.n).toBe(0);
      });
    }
  );

  it.each([
    ["proposal_evidence", "proposal_id", "proposalA"],
    ["job_evidence", "job_id", "jobA"],
  ] as const)(
    "refuses to hard-delete Evidence that a %s link still cites (Evidence is forensic)",
    async (table, key, parent) => {
      await withSystemTestTx(async (tx) => {
        const f = await fixtures(tx);
        await insertRawRow(tx, table, {
          [key]: f[parent],
          evidence_id: f.evidenceA,
          case_id: f.caseA,
          position: 0,
        });
        await expectPostgresRefusal(
          tx.execute(sql`delete from evidence where id = ${f.evidenceA}`),
          {
            code: PG_RESTRICT_VIOLATION,
            constraint: `${table}_evidence_id_case_id_fk`,
          }
        );
      });
    }
  );

  it.each([
    ["proposal_evidence", "proposal_id", "proposalA", "proposals"],
    ["job_evidence", "job_id", "jobA", "jobs"],
  ] as const)(
    "deletes %s links with their parent",
    async (table, key, parent, parentTable) => {
      await withSystemTestTx(async (tx) => {
        const f = await fixtures(tx);
        await insertRawRow(tx, table, {
          [key]: f[parent],
          evidence_id: f.evidenceA,
          case_id: f.caseA,
          position: 0,
        });
        await tx.execute(
          sql`delete from ${sql.identifier(parentTable)} where id = ${f[parent]}`
        );
        const left = await tx.execute(
          sql`select count(*)::int as n from ${sql.identifier(table)} where ${sql.identifier(key)} = ${f[parent]}`
        );
        expect(left[0]?.n).toBe(0);
      });
    }
  );

  it("deletes a whole Case, Evidence included, even though Proposal and Job links restrict an Evidence delete", async () => {
    await withSystemTestTx(async (tx) => {
      const f = await fixtures(tx);
      for (const [table, key, parent] of [
        ["proposal_evidence", "proposal_id", f.proposalA],
        ["job_evidence", "job_id", f.jobA],
      ] as const) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one link table at a time
        await insertRawRow(tx, table, {
          [key]: parent,
          evidence_id: f.evidenceA,
          case_id: f.caseA,
          position: 0,
        });
      }
      await tx.execute(sql`delete from cases where id = ${f.caseA}`);
      const left = await tx.execute(
        sql`select (select count(*) from evidence where case_id = ${f.caseA})::int
              + (select count(*) from proposal_evidence where case_id = ${f.caseA})::int
              + (select count(*) from job_evidence where case_id = ${f.caseA})::int as n`
      );
      expect(left[0]?.n).toBe(0);
    });
  });

  it("still removes the real link rows when the session has temp tables of the same names", async () => {
    await withSystemTestTx(async (tx) => {
      const f = await fixtures(tx);
      for (const [table, key, parent] of [
        ["proposal_evidence", "proposal_id", f.proposalA],
        ["job_evidence", "job_id", f.jobA],
      ] as const) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one link table at a time
        await insertRawRow(tx, table, {
          [key]: parent,
          evidence_id: f.evidenceA,
          case_id: f.caseA,
          position: 0,
        });
      }
      // Shadows the real tables for unqualified names in this session (temp schema comes first).
      await tx.execute(sql`create temp table proposal_evidence (case_id uuid)`);
      await tx.execute(sql`create temp table job_evidence (case_id uuid)`);
      await tx.execute(sql`delete from cases where id = ${f.caseA}`);
      const left = await tx.execute(
        sql`select (select count(*) from public.proposal_evidence where case_id = ${f.caseA})::int
              + (select count(*) from public.job_evidence where case_id = ${f.caseA})::int as n`
      );
      expect(left[0]?.n).toBe(0);
    });
  });
});
