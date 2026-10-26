import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { isDomainTag } from "@watchdog/core/errors";
import {
  createIdentifierEffect,
  deleteIdentifierEffect,
  listIdentifiersEffect,
  updateIdentifierEffect,
} from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import { db, evidenceLinksRepo } from "@watchdog/db";
import { identifierList } from "@watchdog/schemas/graph";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  listAllActivity,
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

describe("createIdentifier", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("blocks confirmed without evidence", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });
    await expect(
      runDomain(
        createIdentifierEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          entityId: entity.id,
          type: "email",
          value: "ada@mailhost.test",
          confidence: "confirmed",
          status: "unknown",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "invalid"
    );
  });

  it("links evidence in the same transaction", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(21) });
    const evidence = await seedEvidence(db, cased.id);
    const created = await runDomain(
      createIdentifierEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        entityId: entity.id,
        type: "email",
        value: "ada@mailhost.test",
        confidence: "unverified",
        status: "unknown",
        evidenceIds: [evidence.id],
      })
    );
    const links = await evidenceLinksRepo.listForIdentifiers(db, [created.id]);
    expect(links.get(created.id)).toEqual([evidence.id]);
  });

  it("stores trimmed notes on create", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(25) });
    const created = await runDomain(
      createIdentifierEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        entityId: entity.id,
        type: "email",
        value: "notes@mailhost.test",
        confidence: "unverified",
        status: "unknown",
        notes: "  primary inbox  ",
      })
    );
    expect(created.notes).toBe("primary inbox");
  });

  it("stores trimmed identifier type on create", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(26) });
    const created = await runDomain(
      createIdentifierEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        entityId: entity.id,
        type: "  email  " as "email",
        value: "typed@mailhost.test",
        confidence: "unverified",
        status: "unknown",
      })
    );
    expect(created.type).toBe("email");
  });

  it("conflicts on a duplicate natural key", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(22) });
    const input = {
      caseId: cased.id,
      organizationId: TEST_ORGANIZATION_ID,
      entityId: entity.id,
      type: "email" as const,
      value: "ada@mailhost.test",
      confidence: "unverified" as const,
      status: "unknown" as const,
    };
    await runDomain(createIdentifierEffect(input));
    await expect(runDomain(createIdentifierEffect(input))).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "conflict"
    );
  });
});

describe("updateIdentifier", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("replaces evidence links", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(23) });
    const first = await seedEvidence(db, cased.id, { label: "first" });
    const second = await seedEvidence(db, cased.id, { label: "second" });
    const created = await runDomain(
      createIdentifierEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        entityId: entity.id,
        type: "email",
        value: "ada@mailhost.test",
        confidence: "unverified",
        status: "unknown",
        evidenceIds: [first.id],
      })
    );
    await runDomain(
      updateIdentifierEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        identifierId: created.id,
        expectedVersion: created.version,
        evidenceIds: [second.id],
      })
    );
    const links = await evidenceLinksRepo.listForIdentifiers(db, [created.id]);
    expect(links.get(created.id)).toEqual([second.id]);
  });

  it("appends one `updated` activity entry for an edit that only replaces the Evidence", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(25) });
    const cite = await seedEvidence(db, cased.id, { label: "cite" });
    const created = await runDomain(
      createIdentifierEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        entityId: entity.id,
        type: "email",
        value: "ada@mailhost.test",
        confidence: "unverified",
        status: "unknown",
      })
    );
    const before = (await listAllActivity()).length;

    const updated = await runDomain(
      updateIdentifierEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        identifierId: created.id,
        expectedVersion: created.version,
        evidenceIds: [cite.id],
      })
    );

    expect(updated.evidenceIds).toEqual([cite.id]);
    const entries = (await listAllActivity()).slice(before);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "identifier",
      action: "updated",
      subjectId: created.id,
      label: "ada@mailhost.test",
    });
  });
});

describe("deleteIdentifier", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("removes the identifier from the case", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(24) });
    const created = await runDomain(
      createIdentifierEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        entityId: entity.id,
        type: "email",
        value: "delete-me@mailhost.test",
        confidence: "unverified",
        status: "unknown",
      })
    );
    await runDomain(
      deleteIdentifierEffect(cased.id, TEST_ORGANIZATION_ID, created.id)
    );
    const remaining = await runDomain(
      listIdentifiersEffect(
        cased.id,
        TEST_ORGANIZATION_ID,
        identifierList.input.parse({ caseId: cased.id })
      ).pipe(Effect.map((page) => page.items))
    );
    expect(remaining.find((row) => row.id === created.id)).toBeUndefined();
  });
});
