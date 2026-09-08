import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";
import { seedCase, seedEntity, withTestTx } from "@watchdog/test-kit/db";

import { questionsRepo } from "../questions.repo.ts";

describe("questionsRepo", () => {
  it("creates then resolves a question", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(20) });
      const created = await questionsRepo.create(tx, {
        entityId: entity.id,
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
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx);
      const caseB = await seedCase(tx);
      const entityB = await seedEntity(tx, caseB.id, { id: testId(21) });
      const created = await questionsRepo.create(tx, {
        entityId: entityB.id,
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

  it("trims padded question text on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(22) });
      const created = await questionsRepo.create(tx, {
        entityId: entity.id,
        text: "  Where does Ada live?  ",
        status: "open",
      });
      expect(created?.text).toBe("Where does Ada live?");
    });
  });

  it("rejects blank question text on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(23) });
      const created = await questionsRepo.create(tx, {
        entityId: entity.id,
        text: "   ",
        status: "open",
      });
      expect(created).toBeNull();
    });
  });
});
