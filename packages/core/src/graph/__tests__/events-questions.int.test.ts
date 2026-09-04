import { beforeEach, describe, expect, it } from "vitest";

import {
  createEventEffect,
  createQuestionEffect,
  reopenQuestionEffect,
  resolveQuestionEffect,
  runDomain
} from "@watchdog/core";
import { db } from "@watchdog/db";
import { testId } from "@watchdog/test-kit";
import { resetTestDb, seedCase, seedEntity } from "@watchdog/test-kit/db";

describe("createEvent", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("creates a case-scoped event", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });
    const created = await runDomain(createEventEffect({
      caseId: cased.id,
      entityId: entity.id,
      when: "1815-12-10",
      what: "Born",
    }));
    expect(created.what).toBe("Born");
  });
});

describe("questions", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("resolves then reopens a question", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(21) });
    const created = await runDomain(createQuestionEffect({
      caseId: cased.id,
      entityId: entity.id,
      text: "Where does Ada live?",
    }));
    const resolved = await runDomain(resolveQuestionEffect({
      caseId: cased.id,
      questionId: created.id,
      resolvedNote: "London",
    }));
    expect(resolved.status).toBe("resolved");
    const reopened = await runDomain(reopenQuestionEffect({
      caseId: cased.id,
      questionId: created.id,
    }));
    expect(reopened.status).toBe("open");
  });
});
