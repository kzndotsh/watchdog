import { beforeEach, describe, expect, it } from "vitest";

import {
  DomainError,
  createIdentifierEffect,
  deleteIdentifierEffect,
  listIdentifiersForCaseEffect,
  updateIdentifierEffect,
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
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
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
      (error: unknown) => DomainError.is(error) && error.code === "conflict"
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
        evidenceIds: [second.id],
      })
    );
    const links = await evidenceLinksRepo.listForIdentifiers(db, [created.id]);
    expect(links.get(created.id)).toEqual([second.id]);
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
      listIdentifiersForCaseEffect(cased.id, TEST_ORGANIZATION_ID)
    );
    expect(remaining.find((row) => row.id === created.id)).toBeUndefined();
  });
});
