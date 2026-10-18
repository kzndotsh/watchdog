import { describe, expect, it } from "vitest";

import { seedCase, seedEntity, withSystemTestTx } from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import { questionsRepo } from "../questions.repo.ts";

describe("questionsRepo", () => {
  it("creates then resolves a question", async () => {
    await withSystemTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(20) });
      const created = await questionsRepo.create(tx, {
        entityId: entity.id,
        caseId: cased.id,
        text: "Where does Ada live?",
        status: "open",
      });
      if (!created) throw new Error("question");
      const resolved = await questionsRepo.resolve(tx, created.id, {
        resolvedNote: "London",
      });
      expect(resolved?.status).toBe("resolved");
    });
  });

  it("updateInCase rejects updates outside the case", async () => {
    await withSystemTestTx(async (tx) => {
      const caseA = await seedCase(tx);
      const caseB = await seedCase(tx);
      const entityB = await seedEntity(tx, caseB.id, { id: testId(21) });
      const created = await questionsRepo.create(tx, {
        entityId: entityB.id,
        caseId: caseB.id,
        text: "Who?",
        status: "open",
      });
      if (!created) throw new Error("question");
      const updated = await questionsRepo.updateInCase(
        tx,
        caseA.id,
        created.id,
        { text: "cross-case" }
      );
      expect(updated).toBeNull();
      const row = await questionsRepo.getInCase(tx, caseB.id, created.id);
      expect(row?.text).toBe("Who?");
    });
  });

  it("deleteInCase removes a question scoped to the case", async () => {
    await withSystemTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(24) });
      const created = await questionsRepo.create(tx, {
        entityId: entity.id,
        caseId: cased.id,
        text: "Delete me?",
        status: "open",
      });
      if (!created) throw new Error("question");
      const deleted = await questionsRepo.deleteInCase(
        tx,
        cased.id,
        created.id
      );
      expect(deleted?.id).toBe(created.id);
      expect(
        await questionsRepo.getInCase(tx, cased.id, created.id)
      ).toBeNull();
    });
  });

  it("deleteInCase rejects cross-case deletes", async () => {
    await withSystemTestTx(async (tx) => {
      const caseA = await seedCase(tx);
      const caseB = await seedCase(tx);
      const entityB = await seedEntity(tx, caseB.id, { id: testId(25) });
      const created = await questionsRepo.create(tx, {
        entityId: entityB.id,
        caseId: caseB.id,
        text: "Stay",
        status: "open",
      });
      if (!created) throw new Error("question");
      expect(
        await questionsRepo.deleteInCase(tx, caseA.id, created.id)
      ).toBeNull();
      expect(
        await questionsRepo.getInCase(tx, caseB.id, created.id)
      ).not.toBeNull();
    });
  });
});
