import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";
import { seedCase, seedEntity, withTestTx } from "@watchdog/test-kit/db";

import { eventsRepo } from "../events.repo.ts";

describe("eventsRepo", () => {
  it("creates, lists, then deletes an event", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(20) });
      const created = await eventsRepo.create(tx, {
        entityId: entity.id,
        when: "1815-12-10",
        what: "Born",
        whereText: "London",
      });
      if (!created) throw new Error("event");
      const listed = await eventsRepo.listForEntity(tx, entity.id);
      expect(listed.some((row) => row.id === created.id)).toBe(true);
      await eventsRepo.delete(tx, created.id);
      const after = await eventsRepo.listForEntity(tx, entity.id);
      expect(after.some((row) => row.id === created.id)).toBe(false);
    });
  });

  it("updateInCase rejects updates outside the case", async () => {
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx);
      const caseB = await seedCase(tx);
      const entityB = await seedEntity(tx, caseB.id, { id: testId(21) });
      const created = await eventsRepo.create(tx, {
        entityId: entityB.id,
        when: "2020-01-01",
        what: "Observed",
        whereText: null,
      });
      if (!created) throw new Error("event");
      const updated = await eventsRepo.updateInCase(tx, caseA.id, created.id, {
        what: "cross-case",
      });
      expect(updated).toBeNull();
      const row = await eventsRepo.getInCase(tx, caseB.id, created.id);
      expect(row?.what).toBe("Observed");
    });
  });

  it("trims padded event fields on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(22) });
      const created = await eventsRepo.create(tx, {
        entityId: entity.id,
        when: "  1815-12-10  ",
        what: "  Born  ",
        whereText: "  London  ",
      });
      expect(created?.when).toBe("1815-12-10");
      expect(created?.what).toBe("Born");
      expect(created?.whereText).toBe("London");
    });
  });

  it("rejects blank required event fields on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(23) });
      const created = await eventsRepo.create(tx, {
        entityId: entity.id,
        when: "   ",
        what: "Born",
        whereText: null,
      });
      expect(created).toBeNull();
    });
  });
});
