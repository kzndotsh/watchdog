import { beforeEach, describe, expect, it } from "vitest";

import { isDomainTag } from "@watchdog/core/errors";
import {
  createEventEffect,
  createQuestionEffect,
  deleteQuestionEffect,
  reopenQuestionEffect,
  resolveQuestionEffect,
} from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import { db, questionsRepo } from "@watchdog/db";
import { resetTestDb, seedCase, seedEntity } from "@watchdog/test-db";
import { TEST_ORGANIZATION_ID, testId } from "@watchdog/test-kit";

describe("createEvent", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("creates a case-scoped event", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });
    const created = await runDomain(
      createEventEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        entityId: entity.id,
        when: "1815-12-10",
        what: "Born",
      })
    );
    expect(created.what).toBe("Born");
  });

  it("rejects whitespace-only event fields", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(22) });
    await expect(
      runDomain(
        createEventEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          entityId: entity.id,
          when: "   ",
          what: "Born",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "invalid"
    );
  });
});

describe("questions", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("resolves then reopens a question", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(21) });
    const created = await runDomain(
      createQuestionEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        entityId: entity.id,
        text: "Where does Ada live?",
      })
    );
    const resolved = await runDomain(
      resolveQuestionEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        questionId: created.id,
        resolvedNote: "  London  ",
      })
    );
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedNote).toBe("London");
    const reopened = await runDomain(
      reopenQuestionEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        questionId: created.id,
      })
    );
    expect(reopened.status).toBe("open");
  });

  it("deletes a question in the case", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(24) });
    const created = await runDomain(
      createQuestionEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        entityId: entity.id,
        text: "Delete me?",
      })
    );
    await runDomain(
      deleteQuestionEffect(cased.id, TEST_ORGANIZATION_ID, created.id)
    );
    const rows = await questionsRepo.listForEntity(db, entity.id);
    expect(rows.some((row) => row.id === created.id)).toBe(false);
  });

  it("rejects whitespace-only question text", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(23) });
    await expect(
      runDomain(
        createQuestionEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          entityId: entity.id,
          text: "  ",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "invalid"
    );
  });
});
