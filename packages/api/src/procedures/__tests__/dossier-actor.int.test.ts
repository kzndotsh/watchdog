import { createRouterClient } from "@orpc/server";
import { beforeEach, describe, expect, it } from "vitest";

import { replayActivityEffect } from "@watchdog/core/activity";
import { runDomain } from "@watchdog/core/infra";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import { resetTestDb, seedCase, seedEntity, testDb } from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import type { ApiContext } from "../../context";
import { router } from "../../router";

const USER = "dossier-editor";

const client = createRouterClient(router, {
  context: {
    headers: new Headers(),
    actor: {
      userId: USER,
      email: null,
      name: USER,
      organizationId: TEST_ORGANIZATION_ID,
    },
    authMethod: "session",
  } satisfies ApiContext,
});

async function entriesOf(caseId: string) {
  const replay = await runDomain(
    replayActivityEffect({
      organizationId: TEST_ORGANIZATION_ID,
      after: { xid: "0", id: 0 },
    })
  );
  if (replay.kind !== "entries") throw new TypeError("expected entries");
  return replay.entries.filter((entry) => entry.caseId === caseId);
}

describe("Dossier edits and Case update carry the caller as the entry's actor", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("every Graph and Case procedure that writes names the caller", async () => {
    const cased = await seedCase(testDb);
    const caseId = cased.id;
    const seeded = await seedEntity(testDb, caseId, {
      id: testId(20),
      name: "Ada",
      slug: "ada",
    });
    const other = await seedEntity(testDb, caseId, {
      id: testId(21),
      name: "Bob",
      slug: "bob",
    });

    await client.cases.update({ caseId, description: "Edited" });
    const entity = await client.entities.create({
      caseId,
      kind: "person",
      name: "Grace",
      slug: "grace",
    });
    await client.entities.update({ caseId, entityId: entity.id, summary: "x" });
    const edge = await client.edges.create({
      caseId,
      fromId: seeded.id,
      toId: other.id,
      predicate: "associate_of",
      confidence: "unverified",
    });
    await client.edges.update({
      caseId,
      edgeId: edge.id,
      notes: "colleagues",
    });
    await client.edges.delete({ caseId, edgeId: edge.id });
    const claim = await client.claims.create({
      caseId,
      entityId: seeded.id,
      text: "Lives in Oslo",
      confidence: "unverified",
      class: "observation",
    });
    await client.claims.update({ caseId, claimId: claim.id, text: "Edited" });
    await client.claims.retract({
      caseId,
      claimId: claim.id,
      kind: "retracted",
      reason: "Wrong person",
    });
    const identifier = await client.identifiers.create({
      caseId,
      entityId: seeded.id,
      type: "email",
      value: "ada@mailhost.test",
      confidence: "unverified",
      status: "unknown",
    });
    await client.identifiers.update({
      caseId,
      identifierId: identifier.id,
      status: "current",
    });
    await client.identifiers.delete({ caseId, identifierId: identifier.id });
    const event = await client.events.create({
      caseId,
      entityId: seeded.id,
      when: "2026-01-01",
      what: "Met Bob",
    });
    await client.events.update({ caseId, eventId: event.id, what: "Met Bea" });
    await client.events.delete({ caseId, eventId: event.id });
    const question = await client.questions.create({
      caseId,
      entityId: seeded.id,
      text: "Where does Ada work?",
    });
    await client.questions.update({
      caseId,
      questionId: question.id,
      text: "Where does Ada live?",
    });
    await client.questions.resolve({ caseId, questionId: question.id });
    await client.questions.reopen({ caseId, questionId: question.id });
    await client.questions.delete({ caseId, questionId: question.id });
    await client.entities.delete({ caseId, entityId: entity.id });

    const entries = await entriesOf(caseId);
    const dossier = entries.filter((entry) =>
      [
        "case",
        "entity",
        "edge",
        "claim",
        "identifier",
        "event",
        "question",
      ].includes(entry.kind)
    );
    // 1 case + 3 entity + 3 edge + 3 claim + 3 identifier + 3 event + 5 question
    expect(dossier).toHaveLength(21);
    expect(dossier.filter((entry) => entry.actorId !== USER)).toEqual([]);
  });
});
