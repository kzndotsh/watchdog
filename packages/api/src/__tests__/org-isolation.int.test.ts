import { ORPCError } from "@orpc/server";
import { beforeAll, describe, expect, it } from "vitest";

import { listVisibleCaseIdsEffect } from "@watchdog/core/cases";
import { isDomainTag } from "@watchdog/core/errors";
import { assertCaseInOrgEffect } from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
  testCaseId,
} from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
  seedGraphWrite,
  seedIdentifier,
  seedJob,
  seedProposal,
  testDb,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

import { foreignCaseAttacks } from "./org-isolation-case-attacks";
import { foreignChildAttacks } from "./org-isolation-child-attacks";
import { clientFor } from "./org-isolation-fixtures";
import type { Attack, IsolationIds } from "./org-isolation-fixtures";

/**
 * Tenant isolation matrix. Organization B calls every case-scoped procedure against
 * organization A's data, two ways:
 *
 *   1. FOREIGN CASE: B passes A's caseId (must be `NOT_FOUND`, same as a missing case).
 *   2. FOREIGN CHILD: B passes its OWN caseId with A's child ids (entity, claim, evidence,
 *      job, proposal, ...). It must not succeed, so A's rows can't be read or changed by
 *      smuggling ids into a case B is allowed to use.
 *
 * Afterwards A's data is compared with a snapshot taken before the attacks.
 */
const ORG_A = TEST_ORGANIZATION_ID;
const ORG_B = TEST_OTHER_ORGANIZATION_ID;
const USER_A = TEST_ACTOR_ID;
const USER_B = "test-actor-b";

const a = clientFor(ORG_A, USER_A);
const b = clientFor(ORG_B, USER_B);

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ORPCError) return error.code;
    return `THROWN:${error instanceof Error ? error.message : String(error)}`;
  }
  return "SUCCEEDED";
}

const ids: IsolationIds = {
  // Placeholders: `beforeAll` seeds the real cases.
  caseA: testCaseId(1),
  caseB: testCaseId(2),
  entityA: testId(10),
  entityA2: testId(11),
  entityB: testId(20),
  claimA: "",
  identifierA: "",
  edgeA: "",
  eventA: "",
  questionA: "",
  taskA: "",
  evidenceA: "",
  jobA: "",
  proposalA: "",
  playbookRunA: testId(77),
};

async function snapshotA() {
  const entities = await a.entities.list({ caseId: ids.caseA });
  const perEntity = await Promise.all(
    [ids.entityA, ids.entityA2].map(async (entityId) => ({
      claims: await a.claims.list({ caseId: ids.caseA, entityId }),
      identifiers: await a.identifiers.list({ caseId: ids.caseA, entityId }),
      events: await a.events.list({ caseId: ids.caseA, entityId }),
      questions: await a.questions.list({ caseId: ids.caseA, entityId }),
    }))
  );
  return JSON.stringify({
    case: await a.cases.get({ caseId: ids.caseA }),
    entities,
    perEntity,
    edges: await a.edges.listForCase({ caseId: ids.caseA }),
    tasks: await a.tasks.list({ caseId: ids.caseA }),
    evidence: await a.evidence.list({ caseId: ids.caseA }),
    jobs: await a.jobs.listForCase({ caseId: ids.caseA }),
    proposals: await a.proposals.listForCase({ caseId: ids.caseA }),
    writes: await a.graph.listWrites({ caseId: ids.caseA }),
  });
}

/**
 * Runs attacks one at a time. After each, organization A's data is compared with `before`,
 * so a denied write that still changed something is named, not just detected at the end.
 */
async function runAttacks(attacks: Attack[], before: string) {
  const outcomes: Record<string, string> = {};
  const changed: string[] = [];
  for (const [name, run] of attacks) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- attacks run one at a time so a leak is attributable
    outcomes[name] = await codeOf(run);
    // oxlint-disable-next-line eslint/no-await-in-loop -- see above
    if ((await snapshotA()) !== before) changed.push(name);
  }
  return { outcomes, changed };
}

describe("organization isolation matrix", () => {
  beforeAll(async () => {
    await resetTestDb();
    const caseA = await seedCase(testDb, {
      name: "Org A",
      slug: "org-a-case",
      organizationId: ORG_A,
    });
    const caseB = await seedCase(testDb, {
      name: "Org B",
      slug: "org-b-case",
      organizationId: ORG_B,
    });
    ids.caseA = caseA.id;
    ids.caseB = caseB.id;

    await seedEntity(testDb, caseA.id, { id: ids.entityA, name: "Alice A" });
    await seedEntity(testDb, caseA.id, {
      id: ids.entityA2,
      name: "Bob A",
      slug: "bob-a",
    });
    await seedEntity(testDb, caseB.id, {
      id: ids.entityB,
      name: "Carol B",
      slug: "carol-b",
    });

    ids.identifierA = (
      await seedIdentifier(testDb, ids.entityA, {
        type: "email",
        value: "alice@example.com",
      })
    ).id;
    ids.evidenceA = (await seedEvidence(testDb, caseA.id)).id;
    ids.jobA = (await seedJob(testDb, caseA.id)).id;
    ids.proposalA = (
      await seedProposal(testDb, caseA.id, [
        {
          op: "create",
          resource: "question",
          id: testId(300),
          data: { entityId: ids.entityA, text: "Who is Alice?" },
        },
      ])
    ).id;
    await seedGraphWrite(testDb, caseA.id, [
      {
        op: "create",
        resource: "question",
        id: testId(301),
        data: { entityId: ids.entityA, text: "Seed write" },
      },
    ]);

    // Children the matrix needs, created through the API as org A.
    ids.claimA = (
      await a.claims.create({
        caseId: caseA.id,
        entityId: ids.entityA,
        text: "Alice lives in Oslo",
        confidence: "unverified",
        class: "observation",
      })
    ).id;
    ids.edgeA = (
      await a.edges.create({
        caseId: caseA.id,
        fromId: ids.entityA,
        toId: ids.entityA2,
        predicate: "associate_of",
        confidence: "unverified",
      })
    ).id;
    ids.eventA = (
      await a.events.create({
        caseId: caseA.id,
        entityId: ids.entityA,
        when: "2026-01-01",
        what: "Met Bob",
      })
    ).id;
    ids.questionA = (
      await a.questions.create({
        caseId: caseA.id,
        entityId: ids.entityA,
        text: "Where does Alice work?",
      })
    ).id;
    ids.taskA = (
      await a.tasks.create({ caseId: caseA.id, title: "Check Alice" })
    ).id;
  });

  it("denies every foreign-case call with not_found and changes nothing", async () => {
    const before = await snapshotA();
    const { outcomes, changed } = await runAttacks(
      foreignCaseAttacks(b, ids),
      before
    );
    const leaks = Object.entries(outcomes).filter(
      ([, code]) => code !== "NOT_FOUND"
    );
    expect(leaks, `not NOT_FOUND: ${JSON.stringify(leaks)}`).toEqual([]);
    expect(
      changed,
      `denied but changed A's data: ${changed.join(", ")}`
    ).toEqual([]);
    expect(await snapshotA()).toBe(before);
  });

  it("answers a foreign-organization Case exactly like a missing one", async () => {
    async function failureOf(caseId: string) {
      try {
        await b.cases.get({ caseId });
      } catch (error) {
        if (error instanceof ORPCError) return error;
      }
      return expect.unreachable("expected an ORPCError");
    }
    const foreignId = ids.caseA;
    const missingId = testCaseId(999);
    const foreign = await failureOf(foreignId);
    const missing = await failureOf(missingId);
    const expected = (id: string) => ({
      code: "NOT_FOUND",
      status: 404,
      message: "Case not found",
      data: { code: "not_found", entity: "Case", id },
    });
    const payload = (error: ORPCError<string, unknown>) => ({
      code: error.code,
      status: error.status,
      message: error.message,
      data: error.data,
    });
    // Exact payloads: only the id each caller sent differs between the two.
    expect(payload(foreign)).toEqual(expected(foreignId));
    expect(payload(missing)).toEqual(expected(missingId));
  });

  it("denies foreign child ids smuggled into an own case, and changes nothing", async () => {
    const before = await snapshotA();
    const { outcomes, changed } = await runAttacks(
      foreignChildAttacks(b, ids),
      before
    );
    const allowed = new Set(["NOT_FOUND", "BAD_REQUEST", "CONFLICT"]);
    const leaks = Object.entries(outcomes).filter(
      ([, code]) => !allowed.has(code)
    );
    expect(leaks, `unexpected outcomes: ${JSON.stringify(leaks)}`).toEqual([]);
    expect(
      changed,
      `denied but changed A's data: ${changed.join(", ")}`
    ).toEqual([]);
    expect(await snapshotA()).toBe(before);
  });

  it("reports a concurrent upsert of the same new entity id as a clean denial, not a database error", async () => {
    const id = testId(90);
    const write = (slug: string) =>
      codeOf(async () =>
        b.graph.write({
          caseId: ids.caseB,
          userOverride: true,
          patch: [
            {
              op: "upsert",
              resource: "entity",
              id,
              data: { kind: "person", name: "Racer", slug },
            },
          ],
        })
      );
    try {
      const outcomes = await Promise.all([write("racer-1"), write("racer-2")]);
      expect(outcomes.filter((code) => code === "SUCCEEDED")).toHaveLength(1);
      expect(
        outcomes.filter((code) => code.startsWith("THROWN:")),
        JSON.stringify(outcomes)
      ).toEqual([]);
    } finally {
      await b.entities.delete({ caseId: ids.caseB, entityId: id });
    }
  });

  it("still serves org A its own data (the matrix is not just failing everything)", async () => {
    const entities = await a.entities.list({ caseId: ids.caseA });
    expect(entities.map((row) => row.id).sort()).toEqual(
      [ids.entityA, ids.entityA2].sort()
    );
    await expect(b.entities.list({ caseId: ids.caseB })).resolves.toHaveLength(
      1
    );
  });

  it("lists only the caller's own Cases, the one case-less procedure that returns case data", async () => {
    expect((await a.cases.list()).map((row) => row.id)).toEqual([ids.caseA]);
    expect((await b.cases.list()).map((row) => row.id)).toEqual([ids.caseB]);
  });

  it("does not resolve another organization's Case slug, so a Case URL naming it is not found", async () => {
    // The web resolves `/cases/$caseSlug/...` by finding the slug in this list.
    const slugsSeenBy = async (client: typeof a) =>
      (await client.cases.list()).map((row) => row.slug);

    expect(await slugsSeenBy(a)).toContain("org-a-case");
    expect(await slugsSeenBy(a)).not.toContain("org-b-case");
    expect(await slugsSeenBy(b)).toContain("org-b-case");
    expect(await slugsSeenBy(b)).not.toContain("org-a-case");
  });

  it("lists only the caller's own Case ids for the live events stream", async () => {
    await expect(runDomain(listVisibleCaseIdsEffect(ORG_A))).resolves.toEqual([
      ids.caseA,
    ]);
    await expect(runDomain(listVisibleCaseIdsEffect(ORG_B))).resolves.toEqual([
      ids.caseB,
    ]);
  });

  it("rejects another organization's Case through core's org-scoped assertion as not_found", async () => {
    await expect(
      runDomain(assertCaseInOrgEffect(ids.caseA, ORG_B))
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "not_found"
    );
    await expect(
      runDomain(assertCaseInOrgEffect(ids.caseA, ORG_A))
    ).resolves.toBe(ids.caseA);
  });
});
