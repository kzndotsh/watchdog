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
  testApiKey,
} from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
  seedGraphWrite,
  seedIdentifier,
  seedJob,
  seedOrganizationMember,
  seedProposal,
  testDb,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

import {
  foreignCaseAttacks,
  TOMBSTONE_AWARE_PROCEDURES,
} from "./org-isolation-case-attacks";
import { foreignChildAttacks } from "./org-isolation-child-attacks";
import { clientFor, procedureOf } from "./org-isolation-fixtures";
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
const MEMBER_A = "test-member-a";

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
  caseSlugA: "org-a-case",
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
  const entities = (await a.entities.list({ caseId: ids.caseA })).items;
  const perEntity = await Promise.all(
    [ids.entityA, ids.entityA2].map(async (entityId) => ({
      claims: (await a.claims.list({ caseId: ids.caseA, entityId })).items,
      identifiers: (await a.identifiers.list({ caseId: ids.caseA, entityId }))
        .items,
      events: (await a.events.list({ caseId: ids.caseA, entityId })).items,
      questions: (await a.questions.list({ caseId: ids.caseA, entityId }))
        .items,
    }))
  );
  return JSON.stringify({
    case: await a.cases.get({ caseId: ids.caseA }),
    entities,
    perEntity,
    edges: (await a.edges.list({ caseId: ids.caseA })).items,
    tasks: (await a.tasks.list({ caseId: ids.caseA })).items,
    evidence: (await a.evidence.list({ caseId: ids.caseA })).items,
    jobs: (await a.jobs.listForCase({ caseId: ids.caseA })).items,
    proposals: (await a.proposals.listForCase({ caseId: ids.caseA })).items,
    writes: (await a.graph.listWrites({ caseId: ids.caseA })).items,
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
    // Owners of their own organizations: a delete, restore or purge needs the role, and the
    // matrix must still answer a foreign Case as not found rather than forbidden.
    await seedOrganizationMember(testDb, {
      organizationId: ORG_A,
      userId: USER_A,
      role: "owner",
    });
    await seedOrganizationMember(testDb, {
      organizationId: ORG_A,
      userId: MEMBER_A,
      role: "member",
    });
    await seedOrganizationMember(testDb, {
      organizationId: ORG_B,
      userId: USER_B,
      role: "owner",
    });
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

  it("reads none of A's rows when B filters or fetches by A's ids in its own Case", async () => {
    // A list filter or a fetch by id is not a lookup that must fail: an id outside the Case
    // matches nothing, so the answer is empty rather than not_found.
    const caseId = ids.caseB;
    const identifiers = await b.identifiers.list({
      caseId,
      entityId: ids.entityA,
    });
    expect(identifiers.items).toEqual([]);
    expect(identifiers.total).toEqual({ count: 0, isCapped: false });
    for (const list of [
      await b.claims.list({ caseId, entityId: ids.entityA }),
      await b.events.list({ caseId, entityId: ids.entityA }),
      await b.questions.list({ caseId, entityId: ids.entityA }),
      await b.edges.list({ caseId, entityId: ids.entityA }),
    ]) {
      expect(list.items).toEqual([]);
      expect(list.total).toEqual({ count: 0, isCapped: false });
    }
    expect(await b.edges.getMany({ caseId, ids: [ids.edgeA] })).toEqual([]);
    const evidence = await b.evidence.list({ caseId, entityId: ids.entityA });
    expect(evidence.items).toEqual([]);
    const picker = await b.evidence.pickerPage({
      caseId,
      entityId: ids.entityA,
    });
    expect(picker.items).toEqual([]);
    const collect = await b.collect.list({ caseId });
    expect(collect.items).toEqual([]);
    await Promise.all(
      [ids.jobA, ids.evidenceA].map(async (id) =>
        expect(b.collect.get({ caseId, id })).rejects.toMatchObject({
          data: { code: "not_found", entity: "Collect item" },
        })
      )
    );
    const queue = await b.proposals.queuePage({ caseId });
    expect(queue.items.map((item) => item.id)).not.toContain(ids.proposalA);
    expect(
      await b.identifiers.getMany({ caseId, ids: [ids.identifierA] })
    ).toEqual([]);
    expect(await b.evidence.getMany({ caseId, ids: [ids.evidenceA] })).toEqual(
      []
    );
    expect(await b.entities.getMany({ caseId, ids: [ids.entityA] })).toEqual(
      []
    );
    // The name lookup answers from B's own Case only: A's Entity "Alice A" is not a match, by name or by slug.
    expect(
      await b.entities.matchNames({ caseId, names: ["Alice A", "alice-a"] })
    ).toEqual([]);
    const entityPicker = await b.entities.pickerPage({ caseId, q: "alice" });
    expect(entityPicker.items.map((entity) => entity.id)).not.toContain(
      ids.entityA
    );
    await expect(
      b.proposals.get({ caseId, proposalId: ids.proposalA })
    ).rejects.toMatchObject({
      data: { code: "not_found", entity: "Proposal" },
    });
    const entities = await b.entities.list({ caseId, q: "alice" });
    expect(entities.items.map((entity) => entity.id)).not.toContain(
      ids.entityA
    );
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
    const entities = (await a.entities.list({ caseId: ids.caseA })).items;
    expect(entities.map((row) => row.id).sort()).toEqual(
      [ids.entityA, ids.entityA2].sort()
    );
    await expect(
      b.entities.list({ caseId: ids.caseB })
    ).resolves.toHaveProperty("items.length", 1);
  });

  it("lists only the caller's own Cases, the one case-less procedure that returns case data", async () => {
    expect((await a.cases.list()).items.map((row) => row.id)).toEqual([
      ids.caseA,
    ]);
    expect((await b.cases.list()).items.map((row) => row.id)).toEqual([
      ids.caseB,
    ]);
  });

  it("resolves a Case slug only inside the caller's organization: a Case URL for another organization's Case is not found", async () => {
    // The web resolves `/cases/$caseSlug/...` through this procedure.
    async function failureOf(caseSlug: string) {
      try {
        await b.cases.getBySlug({ caseSlug });
      } catch (error) {
        if (error instanceof ORPCError) return error;
      }
      return expect.unreachable("expected an ORPCError");
    }

    // B asks for A's real slug and for one that never existed: the same answer, so
    // the response does not reveal that a foreign Case exists.
    const foreign = await failureOf("org-a-case");
    const missing = await failureOf("no-such-case");
    expect(foreign.code).toBe("NOT_FOUND");
    expect(foreign.status).toBe(404);
    expect(foreign.message).toBe(missing.message);
    expect(foreign.data).toEqual({
      code: "not_found",
      entity: "Case",
      id: "org-a-case",
    });
    expect(missing.data).toEqual({
      code: "not_found",
      entity: "Case",
      id: "no-such-case",
    });

    // Each organization still resolves its own slug.
    expect((await a.cases.getBySlug({ caseSlug: "org-a-case" })).id).toBe(
      ids.caseA
    );
    expect((await b.cases.getBySlug({ caseSlug: "org-b-case" })).id).toBe(
      ids.caseB
    );
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

  it("answers every procedure about a deleted Case like a missing one, then serves it again after a restore", async () => {
    const before = await snapshotA();
    const activityBefore = (await a.activity.listRecent({})).items;
    expect(activityBefore.length).toBeGreaterThan(0);
    await a.cases.delete({ caseId: ids.caseA });

    // The owner of the organization asks about its own, now deleted, Case.
    const attacks = foreignCaseAttacks(a, ids).filter(
      ([name]) => !TOMBSTONE_AWARE_PROCEDURES.has(procedureOf(name))
    );
    const outcomes: Record<string, string> = {};
    for (const [name, run] of attacks) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one at a time so a leak is attributable
      outcomes[name] = await codeOf(run);
    }
    const leaks = Object.entries(outcomes).filter(
      ([, code]) => code !== "NOT_FOUND"
    );
    expect(leaks, `not NOT_FOUND: ${JSON.stringify(leaks)}`).toEqual([]);

    // The case-less readers skip it too.
    expect((await a.cases.list()).items.map((row) => row.id)).toEqual([]);
    expect(
      (await a.activity.listRecent({})).items.filter(
        (entry) => entry.caseId === ids.caseA
      )
    ).toEqual([]);
    await expect(runDomain(listVisibleCaseIdsEffect(ORG_A))).resolves.toEqual(
      []
    );
    await expect(
      runDomain(assertCaseInOrgEffect(ids.caseA, ORG_A))
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "not_found"
    );
    // Exactly like a Case that never existed.
    const missing = await codeOf(async () =>
      a.cases.get({ caseId: testCaseId(998) })
    );
    expect(missing).toBe("NOT_FOUND");

    // Nothing was lost: restored, A's data is what it was. The one change is the Case's
    // queued Job, which the delete cancelled and a restore does not resume.
    await a.cases.restore({ caseId: ids.caseA });
    const withoutJobs = (snapshot: string): unknown => {
      const parsed: Record<string, unknown> = JSON.parse(snapshot);
      return { ...parsed, jobs: undefined };
    };
    expect(withoutJobs(await snapshotA())).toEqual(withoutJobs(before));
    const jobs = (await a.jobs.listForCase({ caseId: ids.caseA })).items;
    expect(jobs.map((job) => [job.id, job.status])).toEqual([
      [ids.jobA, "cancelled"],
    ]);
    expect((await a.cases.list()).items.map((row) => row.id)).toEqual([
      ids.caseA,
    ]);
  });

  it("lists deleted Cases only for managers of the caller's own organization", async () => {
    await a.cases.delete({ caseId: ids.caseA });
    try {
      expect(
        (await a.cases.listDeleted({})).items.map((row) => row.id)
      ).toEqual([ids.caseA]);
      expect((await b.cases.listDeleted({})).items).toEqual([]);
      const member = clientFor(ORG_A, MEMBER_A);
      expect(await codeOf(async () => member.cases.listDeleted({}))).toBe(
        "FORBIDDEN"
      );
      // A member opening the deleted Case's URL gets the ordinary not-found.
      expect(
        await codeOf(async () =>
          member.cases.getDeletedBySlug({ caseSlug: ids.caseSlugA })
        )
      ).toBe("NOT_FOUND");
      expect(
        (await a.cases.getDeletedBySlug({ caseSlug: ids.caseSlugA })).id
      ).toBe(ids.caseA);
    } finally {
      await a.cases.restore({ caseId: ids.caseA });
    }
  });

  it("lets only an owner or admin delete, restore and purge, and never an API key", async () => {
    const member = clientFor(ORG_A, MEMBER_A);
    expect(
      await codeOf(async () => member.cases.delete({ caseId: ids.caseA }))
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(async () =>
        clientFor(ORG_A, USER_A, testApiKey("key-a")).cases.delete({
          caseId: ids.caseA,
        })
      )
    ).toBe("FORBIDDEN");
    await a.cases.delete({ caseId: ids.caseA });
    try {
      expect(
        await codeOf(async () => member.cases.restore({ caseId: ids.caseA }))
      ).toBe("FORBIDDEN");
      expect(
        await codeOf(async () => member.cases.purge({ caseId: ids.caseA }))
      ).toBe("FORBIDDEN");
      const key = clientFor(ORG_A, USER_A, testApiKey("key-a"));
      expect(
        await codeOf(async () => key.cases.purge({ caseId: ids.caseA }))
      ).toBe("FORBIDDEN");
      // Restore is session-only too (#369): the key's user is an owner, and still refused.
      expect(
        await codeOf(async () => key.cases.restore({ caseId: ids.caseA }))
      ).toBe("FORBIDDEN");
    } finally {
      await a.cases.restore({ caseId: ids.caseA });
      expect((await a.cases.list()).items.map((row) => row.id)).toEqual([
        ids.caseA,
      ]);
    }
  });

  it("lets only a signed-in session accept or reject a Proposal, never an API key", async () => {
    const propose = async (n: number) =>
      a.proposals.create({
        caseId: ids.caseA,
        patch: [
          {
            op: "create",
            resource: "question",
            id: testId(n),
            data: { entityId: ids.entityA, text: `session only ${n}` },
          },
        ],
      });
    const key = clientFor(ORG_A, USER_A, testApiKey("key-a"));
    const toAccept = await propose(410);
    const toReject = await propose(411);
    expect(
      await codeOf(async () =>
        key.proposals.accept({ caseId: ids.caseA, proposalId: toAccept.id })
      )
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(async () =>
        key.proposals.reject({ caseId: ids.caseA, proposalId: toReject.id })
      )
    ).toBe("FORBIDDEN");
    // The refusals changed nothing: the session still decides both.
    expect(
      (
        await a.proposals.accept({
          caseId: ids.caseA,
          proposalId: toAccept.id,
        })
      ).status
    ).toBe("accepted");
    expect(
      (
        await a.proposals.reject({
          caseId: ids.caseA,
          proposalId: toReject.id,
        })
      ).status
    ).toBe("rejected");
  });
});
