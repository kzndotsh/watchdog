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

  it("rejects self-links even when endpoint ids differ only by padding", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, {
      id: testId(22),
      slug: "solo",
    });
    await expect(
      runDomain(
        createEdgeEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          fromId: `  ${entity.id}  `,
          toId: entity.id,
          predicate: "related_to",
          confidence: "unverified",
          notes: "same entity",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
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

  it("stores trimmed notes on create", async () => {
    const cased = await seedCase(db);
    const from = await seedEntity(db, cased.id, {
      id: testId(26),
      slug: "from-notes",
    });
    const to = await seedEntity(db, cased.id, {
      id: testId(27),
      name: "To Notes",
      slug: "to-notes",
    });
    const created = await runDomain(
      createEdgeEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        fromId: from.id,
        toId: to.id,
        predicate: "related_to",
        confidence: "unverified",
        notes: "  peer connection  ",
      })
    );
    expect(created.notes).toBe("peer connection");
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

  it("allows predicate change to related_to when notes already exist", async () => {
    const cased = await seedCase(db);
    const from = await seedEntity(db, cased.id, {
      id: testId(30),
      slug: "from-related",
    });
    const to = await seedEntity(db, cased.id, {
      id: testId(31),
      name: "To Related",
      slug: "to-related",
    });
    const created = await runDomain(
      createEdgeEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        fromId: from.id,
        toId: to.id,
        predicate: "same_as",
        confidence: "unverified",
        notes: "peer link",
      })
    );
    const updated = await runDomain(
      updateEdgeEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        edgeId: created.id,
        predicate: "related_to",
      })
    );
    expect(updated.predicate).toBe("related_to");
    expect(updated.notes).toBe("peer link");
  });

  it("rejects clearing notes on an existing related_to edge", async () => {
    const cased = await seedCase(db);
    const from = await seedEntity(db, cased.id, {
      id: testId(34),
      slug: "from-clear-notes",
    });
    const to = await seedEntity(db, cased.id, {
      id: testId(35),
      name: "To Clear Notes",
      slug: "to-clear-notes",
    });
    const created = await runDomain(
      createEdgeEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        fromId: from.id,
        toId: to.id,
        predicate: "related_to",
        confidence: "unverified",
        notes: "peer link",
      })
    );
    await expect(
      runDomain(
        updateEdgeEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          edgeId: created.id,
          notes: null,
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
  });

  it("rejects predicate change to related_to when notes are absent", async () => {
    const cased = await seedCase(db);
    const from = await seedEntity(db, cased.id, {
      id: testId(32),
      slug: "from-no-notes",
    });
    const to = await seedEntity(db, cased.id, {
      id: testId(33),
      name: "To No Notes",
      slug: "to-no-notes",
    });
    const created = await runDomain(
      createEdgeEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        fromId: from.id,
        toId: to.id,
        predicate: "same_as",
        confidence: "unverified",
      })
    );
    await expect(
      runDomain(
        updateEdgeEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          edgeId: created.id,
          predicate: "related_to",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
  });

  it("swaps endpoints when ids are padded", async () => {
    const cased = await seedCase(db);
    const from = await seedEntity(db, cased.id, {
      id: testId(36),
      slug: "from-swap",
    });
    const to = await seedEntity(db, cased.id, {
      id: testId(37),
      name: "To Swap",
      slug: "to-swap",
    });
    const created = await runDomain(
      createEdgeEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        fromId: from.id,
        toId: to.id,
        predicate: "same_as",
        confidence: "unverified",
      })
    );
    const updated = await runDomain(
      updateEdgeEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        edgeId: created.id,
        fromId: `  ${to.id}  `,
        toId: from.id,
        viewEntityId: to.id,
      })
    );
    expect(updated.fromId).toBe(to.id);
    expect(updated.toId).toBe(from.id);
    expect(updated.peerId).toBe(from.id);
  });

  it("rejects viewEntityId-only updates", async () => {
    const cased = await seedCase(db);
    const from = await seedEntity(db, cased.id, {
      id: testId(28),
      slug: "from-view",
    });
    const to = await seedEntity(db, cased.id, {
      id: testId(29),
      name: "To View",
      slug: "to-view",
    });
    const created = await runDomain(
      createEdgeEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        fromId: from.id,
        toId: to.id,
        predicate: "same_as",
        confidence: "unverified",
      })
    );
    await expect(
      runDomain(
        updateEdgeEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          edgeId: created.id,
          viewEntityId: to.id,
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
  });
});
