import { ORPCError, createRouterClient } from "@orpc/server";
import { beforeAll, describe, expect, it } from "vitest";

import { listVisibleCaseIdsEffect } from "@watchdog/core/cases";
import { isDomainTag } from "@watchdog/core/errors";
import { assertCaseInOrgEffect } from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import type { OrganizationId } from "@watchdog/schemas/shared";
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

import type { ApiContext } from "../context";
import { router } from "../router";

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

function clientFor(organizationId: OrganizationId, userId: string) {
  const context: ApiContext = {
    headers: new Headers(),
    actor: { userId, email: null, name: userId, organizationId },
    authMethod: "session",
  };
  return createRouterClient(router, { context });
}

const a = clientFor(ORG_A, USER_A);
const b = clientFor(ORG_B, USER_B);

type Attack = readonly [name: string, run: () => Promise<unknown>];

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ORPCError) return error.code;
    return `THROWN:${error instanceof Error ? error.message : String(error)}`;
  }
  return "SUCCEEDED";
}

const ids = {
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

  /** B addresses A's case directly. */
  function foreignCaseAttacks(): Attack[] {
    const caseId = ids.caseA;
    return [
      ["cases.get", async () => b.cases.get({ caseId })],
      ["cases.update", async () => b.cases.update({ caseId, name: "Hijack" })],
      ["cases.delete", async () => b.cases.delete({ caseId })],
      ["entities.list", async () => b.entities.list({ caseId })],
      ["entities.get", async () => b.entities.get({ caseId, slug: "alice-a" })],
      [
        "entities.create",
        async () =>
          b.entities.create({ caseId, kind: "person", name: "Mallory" }),
      ],
      [
        "entities.update",
        async () =>
          b.entities.update({ caseId, entityId: ids.entityA, name: "Hijack" }),
      ],
      [
        "entities.delete",
        async () => b.entities.delete({ caseId, entityId: ids.entityA }),
      ],
      [
        "claims.list",
        async () => b.claims.list({ caseId, entityId: ids.entityA }),
      ],
      [
        "claims.create",
        async () =>
          b.claims.create({
            caseId,
            entityId: ids.entityA,
            text: "planted",
            confidence: "unverified",
            class: "observation",
          }),
      ],
      [
        "claims.update",
        async () =>
          b.claims.update({ caseId, claimId: ids.claimA, text: "planted" }),
      ],
      [
        "claims.retract",
        async () =>
          b.claims.retract({
            caseId,
            claimId: ids.claimA,
            kind: "disproved",
            reason: "x",
          }),
      ],
      [
        "identifiers.list",
        async () => b.identifiers.list({ caseId, entityId: ids.entityA }),
      ],
      [
        "identifiers.listForCase",
        async () => b.identifiers.listForCase({ caseId }),
      ],
      [
        "identifiers.create",
        async () =>
          b.identifiers.create({
            caseId,
            entityId: ids.entityA,
            type: "email",
            value: "mallory@example.com",
            confidence: "unverified",
          }),
      ],
      [
        "identifiers.update",
        async () =>
          b.identifiers.update({
            caseId,
            identifierId: ids.identifierA,
            notes: "planted",
          }),
      ],
      [
        "identifiers.delete",
        async () =>
          b.identifiers.delete({ caseId, identifierId: ids.identifierA }),
      ],
      [
        "edges.list",
        async () => b.edges.list({ caseId, entityId: ids.entityA }),
      ],
      ["edges.listForCase", async () => b.edges.listForCase({ caseId })],
      [
        "edges.create",
        async () =>
          b.edges.create({
            caseId,
            fromId: ids.entityA,
            toId: ids.entityA2,
            predicate: "owns",
            confidence: "unverified",
          }),
      ],
      [
        "edges.update",
        async () => b.edges.update({ caseId, edgeId: ids.edgeA, notes: "x" }),
      ],
      [
        "edges.delete",
        async () => b.edges.delete({ caseId, edgeId: ids.edgeA }),
      ],
      [
        "events.list",
        async () => b.events.list({ caseId, entityId: ids.entityA }),
      ],
      [
        "events.create",
        async () =>
          b.events.create({
            caseId,
            entityId: ids.entityA,
            when: "2026-02-02",
            what: "planted",
          }),
      ],
      [
        "events.update",
        async () =>
          b.events.update({ caseId, eventId: ids.eventA, what: "planted" }),
      ],
      [
        "events.delete",
        async () => b.events.delete({ caseId, eventId: ids.eventA }),
      ],
      [
        "questions.list",
        async () => b.questions.list({ caseId, entityId: ids.entityA }),
      ],
      [
        "questions.create",
        async () =>
          b.questions.create({
            caseId,
            entityId: ids.entityA,
            text: "planted",
          }),
      ],
      [
        "questions.update",
        async () =>
          b.questions.update({ caseId, questionId: ids.questionA, text: "x" }),
      ],
      [
        "questions.resolve",
        async () =>
          b.questions.resolve({
            caseId,
            questionId: ids.questionA,
            resolvedNote: "x",
          }),
      ],
      [
        "questions.reopen",
        async () => b.questions.reopen({ caseId, questionId: ids.questionA }),
      ],
      [
        "questions.delete",
        async () => b.questions.delete({ caseId, questionId: ids.questionA }),
      ],
      ["tasks.list", async () => b.tasks.list({ caseId })],
      ["tasks.get", async () => b.tasks.get({ caseId, taskId: ids.taskA })],
      [
        "tasks.create",
        async () => b.tasks.create({ caseId, title: "planted" }),
      ],
      [
        "tasks.update",
        async () => b.tasks.update({ caseId, taskId: ids.taskA, title: "x" }),
      ],
      [
        "tasks.remove",
        async () => b.tasks.remove({ caseId, taskId: ids.taskA }),
      ],
      [
        "tasks.reorder",
        async () =>
          b.tasks.reorder({
            caseId,
            status: "backlog",
            orderedIds: [ids.taskA],
          }),
      ],
      ["evidence.list", async () => b.evidence.list({ caseId })],
      [
        "evidence.createPaste",
        async () => b.evidence.createPaste({ caseId, body: "planted" }),
      ],
      [
        "evidence.createUrl",
        async () =>
          b.evidence.createUrl({ caseId, sourceUrl: "https://example.com/x" }),
      ],
      [
        "evidence.softDelete",
        async () =>
          b.evidence.softDelete({ caseId, evidenceId: ids.evidenceA }),
      ],
      [
        "evidence.restore",
        async () => b.evidence.restore({ caseId, evidenceId: ids.evidenceA }),
      ],
      [
        "evidence.attachEntity",
        async () =>
          b.evidence.attachEntity({
            caseId,
            evidenceId: ids.evidenceA,
            entityId: ids.entityA,
          }),
      ],
      [
        "evidence.presign",
        async () =>
          b.evidence.presign({
            caseId,
            sha256: "a".repeat(64),
            mime: "text/plain",
            byteLength: 10,
          }),
      ],
      [
        "evidence.confirmFile",
        async () =>
          b.evidence.confirmFile({
            caseId,
            uri: `${caseId}/${"a".repeat(64)}/file.txt`,
            sha256: "a".repeat(64),
            mime: "text/plain",
            byteLength: 10,
          }),
      ],
      [
        "evidence.downloadUrl",
        async () =>
          b.evidence.downloadUrl({ caseId, evidenceId: ids.evidenceA }),
      ],
      [
        "evidence.process",
        async () => b.evidence.process({ caseId, evidenceId: ids.evidenceA }),
      ],
      [
        "evidence.enrich",
        async () => b.evidence.enrich({ caseId, evidenceId: ids.evidenceA }),
      ],
      ["jobs.listForCase", async () => b.jobs.listForCase({ caseId })],
      ["jobs.get", async () => b.jobs.get({ caseId, jobId: ids.jobA })],
      [
        "jobs.start",
        async () =>
          b.jobs.start({
            caseId,
            capabilityId: "network.dns.lookup",
            input: { host: "example.com" },
          }),
      ],
      ["jobs.cancel", async () => b.jobs.cancel({ caseId, jobId: ids.jobA })],
      [
        "jobs.startPlaybook",
        async () =>
          b.jobs.startPlaybook({
            caseId,
            playbookId: "domain.recon",
            seed: { host: "example.com" },
          }),
      ],
      [
        "jobs.cancelPlaybook",
        async () =>
          b.jobs.cancelPlaybook({ caseId, playbookRunId: ids.playbookRunA }),
      ],
      [
        "proposals.listForCase",
        async () => b.proposals.listForCase({ caseId }),
      ],
      [
        "proposals.create",
        async () =>
          b.proposals.create({
            caseId,
            patch: [
              {
                op: "create",
                resource: "question",
                id: testId(400),
                data: { entityId: ids.entityA, text: "planted" },
              },
            ],
          }),
      ],
      [
        "proposals.accept",
        async () => b.proposals.accept({ caseId, proposalId: ids.proposalA }),
      ],
      [
        "proposals.reject",
        async () => b.proposals.reject({ caseId, proposalId: ids.proposalA }),
      ],
      ["graph.listWrites", async () => b.graph.listWrites({ caseId })],
      [
        "graph.write",
        async () =>
          b.graph.write({
            caseId,
            userOverride: true,
            patch: [
              {
                op: "create",
                resource: "question",
                id: testId(401),
                data: { entityId: ids.entityA, text: "planted" },
              },
            ],
          }),
      ],
      ["search.case", async () => b.search.case({ caseId, q: "Alice" })],
      ["activity.listRecent", async () => b.activity.listRecent({ caseId })],
    ];
  }

  /** B uses its own case but supplies A's child ids. */
  function foreignChildAttacks(): Attack[] {
    const caseId = ids.caseB;
    const ownEntity = ids.entityB;
    return [
      [
        "entities.update(A entity)",
        async () =>
          b.entities.update({ caseId, entityId: ids.entityA, name: "Hijack" }),
      ],
      [
        "entities.delete(A entity)",
        async () => b.entities.delete({ caseId, entityId: ids.entityA }),
      ],
      [
        "claims.list(A entity)",
        async () => b.claims.list({ caseId, entityId: ids.entityA }),
      ],
      [
        "claims.create(A entity)",
        async () =>
          b.claims.create({
            caseId,
            entityId: ids.entityA,
            text: "planted",
            confidence: "unverified",
            class: "observation",
          }),
      ],
      [
        "claims.update(A claim)",
        async () =>
          b.claims.update({ caseId, claimId: ids.claimA, text: "planted" }),
      ],
      [
        "claims.retract(A claim)",
        async () =>
          b.claims.retract({
            caseId,
            claimId: ids.claimA,
            kind: "disproved",
            reason: "x",
          }),
      ],
      [
        "identifiers.list(A entity)",
        async () => b.identifiers.list({ caseId, entityId: ids.entityA }),
      ],
      [
        "identifiers.create(A entity)",
        async () =>
          b.identifiers.create({
            caseId,
            entityId: ids.entityA,
            type: "email",
            value: "mallory@example.com",
            confidence: "unverified",
          }),
      ],
      [
        "identifiers.update(A identifier)",
        async () =>
          b.identifiers.update({
            caseId,
            identifierId: ids.identifierA,
            notes: "planted",
          }),
      ],
      [
        "identifiers.delete(A identifier)",
        async () =>
          b.identifiers.delete({ caseId, identifierId: ids.identifierA }),
      ],
      [
        "edges.list(A entity)",
        async () => b.edges.list({ caseId, entityId: ids.entityA }),
      ],
      [
        "edges.create(A endpoints)",
        async () =>
          b.edges.create({
            caseId,
            fromId: ids.entityA,
            toId: ids.entityA2,
            predicate: "owns",
            confidence: "unverified",
          }),
      ],
      [
        "edges.create(own -> A entity)",
        async () =>
          b.edges.create({
            caseId,
            fromId: ownEntity,
            toId: ids.entityA,
            predicate: "owns",
            confidence: "unverified",
          }),
      ],
      [
        "edges.update(A edge)",
        async () => b.edges.update({ caseId, edgeId: ids.edgeA, notes: "x" }),
      ],
      [
        "edges.delete(A edge)",
        async () => b.edges.delete({ caseId, edgeId: ids.edgeA }),
      ],
      [
        "events.list(A entity)",
        async () => b.events.list({ caseId, entityId: ids.entityA }),
      ],
      [
        "events.create(A entity)",
        async () =>
          b.events.create({
            caseId,
            entityId: ids.entityA,
            when: "2026-02-02",
            what: "planted",
          }),
      ],
      [
        "events.update(A event)",
        async () =>
          b.events.update({ caseId, eventId: ids.eventA, what: "planted" }),
      ],
      [
        "events.delete(A event)",
        async () => b.events.delete({ caseId, eventId: ids.eventA }),
      ],
      [
        "questions.list(A entity)",
        async () => b.questions.list({ caseId, entityId: ids.entityA }),
      ],
      [
        "questions.create(A entity)",
        async () =>
          b.questions.create({
            caseId,
            entityId: ids.entityA,
            text: "planted",
          }),
      ],
      [
        "questions.update(A question)",
        async () =>
          b.questions.update({ caseId, questionId: ids.questionA, text: "x" }),
      ],
      [
        "questions.resolve(A question)",
        async () =>
          b.questions.resolve({
            caseId,
            questionId: ids.questionA,
            resolvedNote: "x",
          }),
      ],
      [
        "questions.reopen(A question)",
        async () => b.questions.reopen({ caseId, questionId: ids.questionA }),
      ],
      [
        "questions.delete(A question)",
        async () => b.questions.delete({ caseId, questionId: ids.questionA }),
      ],
      [
        "tasks.get(A task)",
        async () => b.tasks.get({ caseId, taskId: ids.taskA }),
      ],
      [
        "tasks.update(A task)",
        async () => b.tasks.update({ caseId, taskId: ids.taskA, title: "x" }),
      ],
      [
        "tasks.remove(A task)",
        async () => b.tasks.remove({ caseId, taskId: ids.taskA }),
      ],
      [
        "tasks.create(A entity)",
        async () =>
          b.tasks.create({ caseId, title: "planted", entityId: ids.entityA }),
      ],
      [
        "tasks.reorder(A task)",
        async () =>
          b.tasks.reorder({
            caseId,
            status: "backlog",
            orderedIds: [ids.taskA],
          }),
      ],
      [
        "evidence.createPaste(A entity)",
        async () =>
          b.evidence.createPaste({
            caseId,
            body: "planted",
            entityId: ids.entityA,
          }),
      ],
      [
        "evidence.softDelete(A evidence)",
        async () =>
          b.evidence.softDelete({ caseId, evidenceId: ids.evidenceA }),
      ],
      [
        "evidence.restore(A evidence)",
        async () => b.evidence.restore({ caseId, evidenceId: ids.evidenceA }),
      ],
      [
        "evidence.attachEntity(A evidence)",
        async () =>
          b.evidence.attachEntity({
            caseId,
            evidenceId: ids.evidenceA,
            entityId: ownEntity,
          }),
      ],
      [
        "evidence.downloadUrl(A evidence)",
        async () => {
          const { url } = await b.evidence.downloadUrl({
            caseId,
            evidenceId: ids.evidenceA,
          });
          // Lookup is scoped to B's case, so A's row is invisible: no URL may come back.
          throw new ORPCError(url === null ? "NOT_FOUND" : "LEAKED_URL");
        },
      ],
      [
        "evidence.process(A evidence)",
        async () => b.evidence.process({ caseId, evidenceId: ids.evidenceA }),
      ],
      [
        "evidence.enrich(A evidence)",
        async () => b.evidence.enrich({ caseId, evidenceId: ids.evidenceA }),
      ],
      ["jobs.get(A job)", async () => b.jobs.get({ caseId, jobId: ids.jobA })],
      [
        "jobs.cancel(A job)",
        async () => b.jobs.cancel({ caseId, jobId: ids.jobA }),
      ],
      [
        "jobs.cancelPlaybook(A run)",
        async () =>
          b.jobs.cancelPlaybook({ caseId, playbookRunId: ids.playbookRunA }),
      ],
      [
        "proposals.accept(A proposal)",
        async () => b.proposals.accept({ caseId, proposalId: ids.proposalA }),
      ],
      [
        "proposals.reject(A proposal)",
        async () => b.proposals.reject({ caseId, proposalId: ids.proposalA }),
      ],
      [
        "proposals.create+accept(patch references A entity)",
        async () => {
          const proposal = await b.proposals.create({
            caseId,
            patch: [
              {
                op: "create",
                resource: "question",
                id: testId(402),
                data: { entityId: ids.entityA, text: "planted" },
              },
            ],
          });
          return b.proposals.accept({ caseId, proposalId: proposal.id });
        },
      ],
      [
        "graph.write(update A entity)",
        async () =>
          b.graph.write({
            caseId,
            userOverride: true,
            patch: [
              {
                op: "update",
                resource: "entity",
                id: ids.entityA,
                data: { name: "Hijack" },
              },
            ],
          }),
      ],
      [
        "graph.write(upsert A entity id)",
        async () =>
          b.graph.write({
            caseId,
            userOverride: true,
            patch: [
              {
                op: "upsert",
                resource: "entity",
                id: ids.entityA,
                data: { kind: "person", name: "Hijack", slug: "hijack" },
              },
            ],
          }),
      ],
      [
        "graph.write(claim on A entity)",
        async () =>
          b.graph.write({
            caseId,
            userOverride: true,
            patch: [
              {
                op: "create",
                resource: "claim",
                id: testId(403),
                data: { entityId: ids.entityA, text: "planted" },
              },
            ],
          }),
      ],
    ];
  }

  it("denies every foreign-case call with not_found and changes nothing", async () => {
    const before = await snapshotA();
    const outcomes: Record<string, string> = {};
    for (const [name, run] of foreignCaseAttacks()) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- attacks run one at a time so a leak is attributable
      outcomes[name] = await codeOf(run);
    }
    const leaks = Object.entries(outcomes).filter(
      ([, code]) => code !== "NOT_FOUND"
    );
    expect(leaks, `not NOT_FOUND: ${JSON.stringify(leaks)}`).toEqual([]);
    expect(await snapshotA()).toBe(before);
  });

  it("denies foreign child ids smuggled into an own case, and changes nothing", async () => {
    const before = await snapshotA();
    const outcomes: Record<string, string> = {};
    for (const [name, run] of foreignChildAttacks()) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- attacks run one at a time so a leak is attributable
      outcomes[name] = await codeOf(run);
    }
    const allowed = new Set(["NOT_FOUND", "BAD_REQUEST", "CONFLICT"]);
    const leaks = Object.entries(outcomes).filter(
      ([, code]) => !allowed.has(code)
    );
    expect(leaks, `unexpected outcomes: ${JSON.stringify(leaks)}`).toEqual([]);
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
