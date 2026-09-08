import { beforeEach, describe, expect, it } from "vitest";

import {
  DomainError,
  attachEvidenceEntityEffect,
  createAttestationEffect,
  dumpPasteEffect,
  dumpUrlEffect,
  listEvidenceForCaseEffect,
  restoreEvidenceEffect,
  softDeleteEvidenceEffect,
  runDomain,
} from "@watchdog/core";
import { db } from "@watchdog/db";
import {
  TEST_ACTOR_ID,
  testId,
  TEST_ORGANIZATION_ID,
} from "@watchdog/test-kit";
import {
  resetTestDb,
  seedAuthUser,
  seedCase,
  seedEntity,
} from "@watchdog/test-kit/db";

describe("dumpUrl", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("uploads paste bytes as file Evidence", async () => {
    const cased = await seedCase(db);
    const dumped = await runDomain(
      dumpPasteEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        body: "Contact ada@mailhost.test",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        label: "paste",
      })
    );
    expect(dumped.kind).toBe("file");
    expect(dumped.uri).toBeTruthy();
    expect(dumped.sha256).toBeTruthy();
    expect(dumped.mime).toMatch(/text\/plain/);
    expect(dumped.actorLabel).toBe(TEST_ACTOR_ID);
  });

  it("rejects whitespace-only paste bodies", async () => {
    const cased = await seedCase(db);
    await expect(
      runDomain(
        dumpPasteEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          body: "   ",
          actorId: TEST_ACTOR_ID,
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) =>
        DomainError.is(error) &&
        error.code === "invalid" &&
        error.message === "Paste body is required"
    );
  });

  it("rejects blank actorId", async () => {
    const cased = await seedCase(db);
    await expect(
      runDomain(
        dumpPasteEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          body: "note",
          actorId: "   ",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) =>
        DomainError.is(error) &&
        error.code === "invalid" &&
        error.message === "actorId is required"
    );
  });

  it("resolves actorLabel from auth.user", async () => {
    const cased = await seedCase(db);
    const userId = crypto.randomUUID();
    await seedAuthUser(db, {
      id: userId,
      name: "Ada",
      email: `ada-${userId}@mailhost.test`,
    });
    const dumped = await runDomain(
      dumpPasteEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        body: "Contact ada@mailhost.test",
        actorId: userId,
        label: "paste",
      })
    );
    expect(dumped.actorLabel).toBe("ada");
  });

  it("stores null sourceUrl when paste seed URL is whitespace-only", async () => {
    const cased = await seedCase(db);
    const dumped = await runDomain(
      dumpPasteEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        body: "note body",
        sourceUrl: "   ",
        actorId: TEST_ACTOR_ID,
      })
    );
    expect(dumped.sourceUrl).toBeNull();
  });

  it("persists a URL dump then hide and restore", async () => {
    const cased = await seedCase(db);
    const dumped = await runDomain(
      dumpUrlEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: "https://mailhost.test/ada",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        label: "ada page",
      })
    );
    expect(dumped.sourceUrl).toBe("https://mailhost.test/ada");
    expect(dumped.kind).toBe("other");

    const trimmed = await runDomain(
      dumpUrlEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: "https://mailhost.test/notes",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        label: "  ada page  ",
        notes: "  cited source  ",
      })
    );
    expect(trimmed.label).toBe("ada page");
    expect(trimmed.notes).toBe("cited source");

    await runDomain(
      softDeleteEvidenceEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        evidenceId: dumped.id,
      })
    );
    const active = await runDomain(
      listEvidenceForCaseEffect(cased.id, TEST_ORGANIZATION_ID)
    );
    expect(active.some((row) => row.id === dumped.id)).toBe(false);

    await runDomain(
      restoreEvidenceEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        evidenceId: dumped.id,
      })
    );
    const restored = await runDomain(
      listEvidenceForCaseEffect(cased.id, TEST_ORGANIZATION_ID)
    );
    expect(restored.some((row) => row.id === dumped.id)).toBe(true);
  });

  it("trims padded entityId on dump paste", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(22) });
    const dumped = await runDomain(
      dumpPasteEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        body: "Contact ada@mailhost.test",
        actorId: TEST_ACTOR_ID,
        entityId: `  ${entity.id}  `,
      })
    );
    expect(dumped.entityId).toBe(entity.id);
  });

  it("attaches an in-case entity and rejects a foreign entity", async () => {
    const cased = await seedCase(db);
    const other = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });
    const foreign = await seedEntity(db, other.id, {
      id: testId(21),
      slug: "foreign",
    });
    const dumped = await runDomain(
      dumpUrlEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: "https://mailhost.test/",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
      })
    );

    const attached = await runDomain(
      attachEvidenceEntityEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        evidenceId: dumped.id,
        entityId: entity.id,
      })
    );
    expect(attached.entityId).toBe(entity.id);

    await expect(
      runDomain(
        attachEvidenceEntityEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          evidenceId: dumped.id,
          entityId: foreign.id,
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "not_found"
    );
  });

  it("rejects invalid entityId instead of clearing the attachment", async () => {
    const cased = await seedCase(db);
    const dumped = await runDomain(
      dumpUrlEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: "https://example.test/invalid-attach",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
      })
    );

    await expect(
      runDomain(
        attachEvidenceEntityEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          evidenceId: dumped.id,
          entityId: "not-a-uuid",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
  });

  it("rejects hiddenOnly with active-queue filters", async () => {
    const cased = await seedCase(db);
    await expect(
      runDomain(
        listEvidenceForCaseEffect(cased.id, TEST_ORGANIZATION_ID, {
          hiddenOnly: true,
          unprocessedOnly: true,
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
  });

  it("trims padded evidenceId on soft delete", async () => {
    const cased = await seedCase(db);
    const dumped = await runDomain(
      dumpUrlEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: "https://mailhost.test/hide-me",
        actorId: TEST_ACTOR_ID,
      })
    );
    await runDomain(
      softDeleteEvidenceEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        evidenceId: `  ${dumped.id}  `,
      })
    );
    const active = await runDomain(
      listEvidenceForCaseEffect(cased.id, TEST_ORGANIZATION_ID)
    );
    expect(active.some((row) => row.id === dumped.id)).toBe(false);
  });

  it("rejects whitespace-only URL dumps", async () => {
    const cased = await seedCase(db);
    await expect(
      runDomain(
        dumpUrlEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          sourceUrl: "   ",
          actorId: TEST_ACTOR_ID,
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
  });

  it("creates attestation text evidence", async () => {
    const cased = await seedCase(db);
    const note = await runDomain(
      createAttestationEffect({
        caseId: cased.id,
        text: "I copied this from WHOIS",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
      })
    );
    expect(note.kind).toBe("attestation");
    expect(note.text).toBe("I copied this from WHOIS");
  });

  it("trims padded entityId on attestation", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(30) });
    const note = await runDomain(
      createAttestationEffect({
        caseId: cased.id,
        text: "Linked attestation",
        entityId: `  ${entity.id}  `,
        actorId: TEST_ACTOR_ID,
      })
    );
    expect(note.entityId).toBe(entity.id);
  });

  it("rejects invalid entityId on attestation", async () => {
    const cased = await seedCase(db);
    await expect(
      runDomain(
        createAttestationEffect({
          caseId: cased.id,
          text: "Bad entity ref",
          entityId: "not-a-uuid",
          actorId: TEST_ACTOR_ID,
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
  });

  it("rejects blank actorId on attestation", async () => {
    const cased = await seedCase(db);
    await expect(
      runDomain(
        createAttestationEffect({
          caseId: cased.id,
          text: "No actor",
          actorId: "   ",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
  });
});
