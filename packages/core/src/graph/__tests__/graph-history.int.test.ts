import { beforeEach, describe, expect, it } from "vitest";

import { isDomainTag } from "@watchdog/core/errors";
import {
  applyPatchEffect,
  createClaimEffect,
  createEdgeEffect,
  createEntityEffect,
  createEventEffect,
  createIdentifierEffect,
  createQuestionEffect,
  deleteEntityEffect,
  listGraphHistoryEffect,
  updateClaimEffect,
  updateEntityFieldsEffect,
} from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import {
  acceptProposalEffect,
  writeGraphFromAgentEffect,
} from "@watchdog/core/proposals";
import { createTaskEffect } from "@watchdog/core/tasks";
import { db } from "@watchdog/db";
import type {
  CaseId,
  GraphHistoryKind,
  OrganizationId,
} from "@watchdog/schemas/shared";
import {
  buildClaimCreateOp,
  buildEntityCreateOp,
  buildIdentifierCreateOp,
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  listAllGraphHistory,
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
  seedProposal,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

import { editEntityRetrying } from "./edit-retrying";

const REVIEWER = testId(950);
const base = (caseId: CaseId) => ({
  caseId,
  organizationId: TEST_ORGANIZATION_ID,
});

async function historyOf(kind: GraphHistoryKind, rowId: string) {
  return (await listAllGraphHistory()).filter(
    (row) => row.kind === kind && row.rowId === rowId
  );
}

describe("Graph history across write paths", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("chains each update's before to the previous after, with the exact changed fields", async () => {
    const cased = await seedCase(db);
    const created = await runDomain(
      createEntityEffect({
        ...base(cased.id),
        kind: "org",
        name: "Acme",
        slug: "acme",
        actorId: TEST_ACTOR_ID,
      })
    );
    let version = created.version;
    for (const summary of ["Shell company", "Holding company"]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential edits build the chain
      const edited = await runDomain(
        updateEntityFieldsEffect({
          ...base(cased.id),
          entityId: created.id,
          expectedVersion: version,
          summary,
          actorId: REVIEWER,
        })
      );
      version = edited.version;
    }

    const rows = await historyOf("entity", created.id);
    expect(rows.map((row) => row.op)).toEqual(["create", "update", "update"]);
    expect(rows.map((row) => row.actorId)).toEqual([
      TEST_ACTOR_ID,
      REVIEWER,
      REVIEWER,
    ]);
    expect(rows[0]?.before).toBeNull();
    expect(rows[1]?.before).toEqual(rows[0]?.after);
    expect(rows[2]?.before).toEqual(rows[1]?.after);
    expect(rows[2]?.before).toMatchObject({ summary: "Shell company" });
    expect(rows[2]?.after).toMatchObject({
      summary: "Holding company",
      created_by: TEST_ACTOR_ID,
      updated_by: REVIEWER,
    });
    const page = await runDomain(
      listGraphHistoryEffect(TEST_ORGANIZATION_ID, {
        caseId: cased.id,
        kind: "entity",
        rowId: created.id,
        limit: 10,
      })
    );
    // newest first; a create lists every field the new row holds
    expect(page.items.map((entry) => entry.changedFields.length)).toEqual([
      1,
      1,
      page.items[2]?.changedFields.length,
    ]);
    expect(page.items[0]?.changedFields).toEqual(["summary"]);
    expect(page.items[1]?.changedFields).toEqual(["summary"]);
    expect(page.items[2]?.changedFields).toEqual(
      expect.arrayContaining(["name", "slug", "kind", "createdBy"])
    );
    expect(page.items[2]?.changedFields).not.toContain("updatedAt");
  });

  it("two concurrent edits of one row record a chain, not two copies of the same before", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id);
    await Promise.all(
      ["from A", "from B"].map(async (summary) =>
        editEntityRetrying({
          ...base(cased.id),
          entityId: entity.id,
          summary,
          actorId: TEST_ACTOR_ID,
        })
      )
    );
    // the seeded create, then the two edits
    const rows = (await historyOf("entity", entity.id)).filter(
      (row) => row.op === "update"
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]?.before).toEqual(rows[0]?.after);
    expect(rows[0]?.before).toMatchObject({ summary: null });
  });

  it("a failed transaction leaves no history row, from any op before the failure", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id);
    const before = await listAllGraphHistory();
    await expect(
      runDomain(
        applyPatchEffect({
          caseId: cased.id,
          channel: "triage_accept",
          confidence: "unverified",
          actor: { actorId: TEST_ACTOR_ID },
          patch: [
            buildClaimCreateOp(entity.id, "Fine on its own", {
              id: testId(61),
            }),
            buildClaimCreateOp(testId(999), "Orphan", { id: testId(62) }),
          ],
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "not_found"
    );
    expect(await listAllGraphHistory()).toHaveLength(before.length);
  });

  it("Triage Accept of a multi-op patch records one row per op, through the triage_accept channel", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });
    const { id: proposalId } = await seedProposal(db, cased.id, [
      buildEntityCreateOp("Grace Hopper", "grace", "org", { id: testId(71) }),
      buildClaimCreateOp(entity.id, "Coined debugging", { id: testId(72) }),
      buildIdentifierCreateOp(entity.id, "email", "ada@mailhost.test", {
        id: testId(73),
      }),
    ]);
    await runDomain(
      acceptProposalEffect({
        ...base(cased.id),
        proposalId,
        actorId: REVIEWER,
        confidence: "unverified",
      })
    );

    const rows = (await listAllGraphHistory()).filter(
      (row) => row.channel === "triage_accept"
    );
    expect(rows.map((row) => `${row.kind}.${row.op}`)).toEqual([
      "entity.create",
      "claim.create",
      "identifier.create",
    ]);
    for (const row of rows) {
      expect(row.channel).toBe("triage_accept");
      expect(row.actorId).toBe(REVIEWER);
      expect(row.actorLabel).toBeNull();
      expect(row.after).toMatchObject({
        created_by: REVIEWER,
        updated_by: REVIEWER,
      });
    }
  });

  it("an agent graph write records the acting user, the key, and the agent_write channel", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(21) });
    await runDomain(
      writeGraphFromAgentEffect({
        ...base(cased.id),
        actorId: TEST_ACTOR_ID,
        actorLabel: "api-key:ci-bot",
        userOverride: true,
        patch: [
          buildClaimCreateOp(entity.id, "Seen at the port", { id: testId(81) }),
        ],
        idempotencyKey: "hist-1",
      })
    );
    const rows = await historyOf("claim", testId(81));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      op: "create",
      channel: "agent_write",
      actorId: TEST_ACTOR_ID,
      actorLabel: "api-key:ci-bot",
    });
    expect(rows[0]?.after).toMatchObject({ created_by: TEST_ACTOR_ID });

    const page = await runDomain(
      listGraphHistoryEffect(TEST_ORGANIZATION_ID, {
        caseId: cased.id,
        kind: "claim",
        rowId: testId(81),
        limit: 10,
      })
    );
    expect(page.items[0]?.actorName).toBe("api-key:ci-bot");
  });

  it("deleting an Entity records a delete for every row it cascades to and an update for each unlinked Task", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });
    const other = await seedEntity(db, cased.id, {
      id: testId(21),
      slug: "other",
      kind: "org",
    });
    const scope = { ...base(cased.id), actorId: TEST_ACTOR_ID };
    const claim = await runDomain(
      createClaimEffect({
        ...scope,
        entityId: entity.id,
        text: "Owns a boat",
        confidence: "unverified",
        class: "observation",
      })
    );
    const identifier = await runDomain(
      createIdentifierEffect({
        ...scope,
        entityId: entity.id,
        type: "email",
        value: "ada@mailhost.test",
        confidence: "unverified",
        status: "unknown",
      })
    );
    const event = await runDomain(
      createEventEffect({
        ...scope,
        entityId: entity.id,
        when: "1840",
        what: "Wrote",
      })
    );
    const question = await runDomain(
      createQuestionEffect({ ...scope, entityId: entity.id, text: "Where?" })
    );
    const edge = await runDomain(
      createEdgeEffect({
        ...scope,
        fromId: other.id,
        toId: entity.id,
        predicate: "associate_of",
        confidence: "unverified",
      })
    );
    const task = await runDomain(
      createTaskEffect({ ...scope, title: "Follow up", entityId: entity.id })
    );
    const seededQuestions = (await listAllGraphHistory()).filter(
      (row) => row.kind === "question"
    ).length;
    const before = await listAllGraphHistory();

    await runDomain(
      deleteEntityEffect(cased.id, TEST_ORGANIZATION_ID, entity.id, {
        actorId: REVIEWER,
      })
    );

    const added = (await listAllGraphHistory()).slice(before.length);
    const summary = added
      .map((row) => `${row.kind}.${row.op}`)
      .sort((a, b) => a.localeCompare(b));
    expect(summary).toEqual(
      [
        "entity.delete",
        "claim.delete",
        "identifier.delete",
        "event.delete",
        "edge.delete",
        // the one Question the test created, plus the Person defaults seeded with the Entity
        ...Array.from({ length: seededQuestions }, () => "question.delete"),
        "task.update",
      ].sort((a, b) => a.localeCompare(b))
    );
    expect(added.every((row) => row.actorId === REVIEWER)).toBe(true);
    expect(added.every((row) => row.channel === "dossier")).toBe(true);
    const ids = new Set(added.map((row) => row.rowId));
    for (const id of [
      claim.id,
      identifier.id,
      event.id,
      question.id,
      edge.id,
      task.id,
    ]) {
      expect(ids.has(id)).toBe(true);
    }
    // the deleted Claim's snapshot keeps its evidence ids and text
    const claimDelete = added.find((row) => row.rowId === claim.id);
    expect(claimDelete?.before).toMatchObject({
      text: "Owns a boat",
      evidence_ids: [],
    });
    expect(claimDelete?.after).toBeNull();
    // the Task keeps living, now unlinked
    const taskUpdate = added.find((row) => row.rowId === task.id);
    expect(taskUpdate?.before).toMatchObject({ entity_id: entity.id });
    expect(taskUpdate?.after).toMatchObject({ entity_id: null });
  });

  it("a change to a Claim's evidence set shows in its snapshots", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id);
    const evidence = await seedEvidence(db, cased.id);
    const claim = await runDomain(
      createClaimEffect({
        ...base(cased.id),
        entityId: entity.id,
        text: "Cited",
        confidence: "unverified",
        class: "observation",
      })
    );
    await runDomain(
      updateClaimEffect({
        ...base(cased.id),
        claimId: claim.id,
        expectedVersion: claim.version,
        evidenceIds: [evidence.id],
      })
    );
    const rows = await historyOf("claim", claim.id);
    expect(rows[1]?.before).toMatchObject({ evidence_ids: [] });
    expect(rows[1]?.after).toMatchObject({ evidence_ids: [evidence.id] });
    const page = await runDomain(
      listGraphHistoryEffect(TEST_ORGANIZATION_ID, {
        caseId: cased.id,
        kind: "claim",
        rowId: claim.id,
        limit: 1,
      })
    );
    expect(page.items[0]?.changedFields).toContain("evidenceIds");
  });
});

describe("listing a row's history", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  async function entityWithEdits(edits: number) {
    const cased = await seedCase(db);
    const entity = await runDomain(
      createEntityEffect({
        ...base(cased.id),
        kind: "org",
        name: "Acme",
        slug: "acme",
        actorId: TEST_ACTOR_ID,
      })
    );
    let version = entity.version;
    for (let index = 0; index < edits; index += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- edits must land in order
      const edited = await runDomain(
        updateEntityFieldsEffect({
          ...base(cased.id),
          entityId: entity.id,
          expectedVersion: version,
          notes: `note ${index}`,
          actorId: TEST_ACTOR_ID,
        })
      );
      version = edited.version;
    }
    return { cased, entity };
  }

  it("pages newest first by cursor, and the last page has no cursor", async () => {
    const { cased, entity } = await entityWithEdits(4);
    const list = (cursor?: string) =>
      runDomain(
        listGraphHistoryEffect(TEST_ORGANIZATION_ID, {
          caseId: cased.id,
          kind: "entity",
          rowId: entity.id,
          limit: 2,
          cursor,
        })
      );
    const first = await list();
    expect(first.items.map((entry) => entry.op)).toEqual(["update", "update"]);
    expect(first.nextCursor).not.toBeNull();
    const second = await list(first.nextCursor ?? undefined);
    const third = await list(second.nextCursor ?? undefined);
    expect(second.nextCursor).not.toBeNull();
    expect(third.nextCursor).toBeNull();
    const all = [...first.items, ...second.items, ...third.items];
    expect(all.map((entry) => entry.op)).toEqual([
      "update",
      "update",
      "update",
      "update",
      "create",
    ]);
    expect(new Set(all.map((entry) => entry.id)).size).toBe(5);
    expect(all.map((entry) => entry.id)).toEqual(
      all.map((entry) => entry.id).sort((a, b) => b - a)
    );
  });

  it("an exactly full last page has no cursor either", async () => {
    const { cased, entity } = await entityWithEdits(1);
    const page = await runDomain(
      listGraphHistoryEffect(TEST_ORGANIZATION_ID, {
        caseId: cased.id,
        kind: "entity",
        rowId: entity.id,
        limit: 2,
      })
    );
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it("rejects a malformed cursor as invalid input", async () => {
    const { cased, entity } = await entityWithEdits(0);
    await expect(
      runDomain(
        listGraphHistoryEffect(TEST_ORGANIZATION_ID, {
          caseId: cased.id,
          kind: "entity",
          rowId: entity.id,
          limit: 2,
          cursor: "1; drop table graph_history",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "invalid"
    );
  });

  it("is visible only inside the organization and Case that own the row", async () => {
    const { cased, entity } = await entityWithEdits(1);
    const otherOrgCase = await seedCase(db, {
      slug: "elsewhere",
      organizationId: TEST_OTHER_ORGANIZATION_ID,
    });
    const sameOrgCase = await seedCase(db, { slug: "sibling" });
    const failure = (organizationId: OrganizationId, caseId: CaseId) =>
      runDomain(
        listGraphHistoryEffect(organizationId, {
          caseId,
          kind: "entity",
          rowId: entity.id,
          limit: 10,
        })
      ).then(
        () => "listed",
        (error: unknown) => (isDomainTag(error) ? error.code : "other")
      );
    // another organization, even with the right Case id
    expect(await failure(TEST_OTHER_ORGANIZATION_ID, cased.id)).toBe(
      "not_found"
    );
    // the owner's other Case does not know this row
    expect(await failure(TEST_ORGANIZATION_ID, sameOrgCase.id)).toBe(
      "not_found"
    );
    // the other organization's own Case does not either
    expect(await failure(TEST_OTHER_ORGANIZATION_ID, otherOrgCase.id)).toBe(
      "not_found"
    );
    expect(await failure(TEST_ORGANIZATION_ID, cased.id)).toBe("listed");
  });

  it("keeps the history of a deleted row readable, with no live attribution", async () => {
    const { cased, entity } = await entityWithEdits(1);
    await runDomain(
      deleteEntityEffect(cased.id, TEST_ORGANIZATION_ID, entity.id, {
        actorId: REVIEWER,
      })
    );
    const page = await runDomain(
      listGraphHistoryEffect(TEST_ORGANIZATION_ID, {
        caseId: cased.id,
        kind: "entity",
        rowId: entity.id,
        limit: 10,
      })
    );
    expect(page.attribution).toBeNull();
    expect(page.items.map((entry) => entry.op)).toEqual([
      "delete",
      "update",
      "create",
    ]);
  });

  it("shows a row written straight through a repo (a seed) as the system's, with no author", async () => {
    const cased = await seedCase(db);
    const seeded = await seedEntity(db, cased.id);
    const page = await runDomain(
      listGraphHistoryEffect(TEST_ORGANIZATION_ID, {
        caseId: cased.id,
        kind: "entity",
        rowId: seeded.id,
        limit: 10,
      })
    );
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      op: "create",
      channel: "system",
      actorId: null,
      actorName: null,
    });
    expect(page.nextCursor).toBeNull();
    expect(page.attribution).toMatchObject({
      createdBy: null,
      updatedBy: null,
    });
    expect(page.attribution?.createdAt).not.toBe("");
  });

  it("names the live row's creator and last editor", async () => {
    const { cased, entity } = await entityWithEdits(1);
    const page = await runDomain(
      listGraphHistoryEffect(TEST_ORGANIZATION_ID, {
        caseId: cased.id,
        kind: "entity",
        rowId: entity.id,
        limit: 10,
      })
    );
    // no auth.user row exists for the test actor, so the label falls back to its id
    expect(page.attribution).toMatchObject({
      createdBy: TEST_ACTOR_ID,
      updatedBy: TEST_ACTOR_ID,
    });
  });
});
