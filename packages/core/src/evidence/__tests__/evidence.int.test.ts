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
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";
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
        body: "Contact ada@mailhost.test",
        actorId: userId,
        label: "paste",
      })
    );
    expect(dumped.actorLabel).toBe("ada");
  });

  it("persists a URL dump then hide and restore", async () => {
    const cased = await seedCase(db);
    const dumped = await runDomain(
      dumpUrlEffect({
        caseId: cased.id,
        sourceUrl: "https://mailhost.test/ada",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        label: "ada page",
      })
    );
    expect(dumped.sourceUrl).toBe("https://mailhost.test/ada");
    expect(dumped.kind).toBe("other");

    await runDomain(
      softDeleteEvidenceEffect({ caseId: cased.id, evidenceId: dumped.id })
    );
    const active = await runDomain(listEvidenceForCaseEffect(cased.id));
    expect(active.some((row) => row.id === dumped.id)).toBe(false);

    await runDomain(
      restoreEvidenceEffect({ caseId: cased.id, evidenceId: dumped.id })
    );
    const restored = await runDomain(listEvidenceForCaseEffect(cased.id));
    expect(restored.some((row) => row.id === dumped.id)).toBe(true);
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
        sourceUrl: "https://mailhost.test/",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
      })
    );

    const attached = await runDomain(
      attachEvidenceEntityEffect({
        caseId: cased.id,
        evidenceId: dumped.id,
        entityId: entity.id,
      })
    );
    expect(attached.entityId).toBe(entity.id);

    await expect(
      runDomain(
        attachEvidenceEntityEffect({
          caseId: cased.id,
          evidenceId: dumped.id,
          entityId: foreign.id,
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "not_found"
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
});
