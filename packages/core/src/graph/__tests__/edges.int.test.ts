import { beforeEach, describe, expect, it } from "vitest";

import {
  DomainError,
  createEdgeEffect,
  updateEdgeEffect,
  runDomain,
} from "@watchdog/core";
import { db, evidenceLinksRepo } from "@watchdog/db";
import { TEST_ORGANIZATION_ID, testId } from "@watchdog/test-kit";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
} from "@watchdog/test-kit/db";

describe("createEdge", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("requires notes for related_to", async () => {
    const cased = await seedCase(db);
    const from = await seedEntity(db, cased.id, {
      id: testId(20),
      slug: "from",
    });
    const to = await seedEntity(db, cased.id, {
      id: testId(21),
      name: "To",
      slug: "to",
    });
    await expect(
      runDomain(
        createEdgeEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          fromId: from.id,
          toId: to.id,
          predicate: "related_to",
          confidence: "unverified",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
  });

  it("rejects a kind-illegal predicate", async () => {
    const cased = await seedCase(db);
    const from = await seedEntity(db, cased.id, {
      id: testId(22),
      kind: "person",
      slug: "ada",
    });
    const to = await seedEntity(db, cased.id, {
      id: testId(23),
      kind: "person",
      name: "Peer",
      slug: "peer",
    });
    await expect(
      runDomain(
        createEdgeEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          fromId: from.id,
          toId: to.id,
          predicate: "primary_domain",
          confidence: "unverified",
        })
      )
    ).rejects.toThrow(/not allowed/i);
  });
});

describe("updateEdge", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("replaces evidence rather than appending", async () => {
    const cased = await seedCase(db);
    const from = await seedEntity(db, cased.id, {
      id: testId(24),
      slug: "from-e",
    });
    const to = await seedEntity(db, cased.id, {
      id: testId(25),
      name: "To E",
      slug: "to-e",
    });
    const first = await seedEvidence(db, cased.id, { label: "a" });
    const second = await seedEvidence(db, cased.id, { label: "b" });
    const created = await runDomain(
      createEdgeEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        fromId: from.id,
        toId: to.id,
        predicate: "same_as",
        confidence: "unverified",
        evidenceIds: [first.id],
      })
    );
    await runDomain(
      updateEdgeEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        edgeId: created.id,
        evidenceIds: [second.id],
      })
    );
    const links = await evidenceLinksRepo.listForEdges(db, [created.id]);
    expect(links.get(created.id)).toEqual([second.id]);
  });
});
