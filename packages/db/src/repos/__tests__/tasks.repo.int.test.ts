import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";
import { seedCase, seedEntity, withTestTx } from "@watchdog/test-kit/db";

import { tasksRepo } from "../tasks.repo.ts";

describe("tasksRepo", () => {
  it("filters unattached tasks for a case", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await tasksRepo.create(tx, {
        caseId: cased.id,
        title: "Unattached follow-up",
        status: "backlog",
      });
      if (!created) throw new Error("task");
      const listed = await tasksRepo.listForCase(tx, cased.id, {
        unattachedOnly: true,
      });
      expect(listed.some((row) => row.id === created.id)).toBe(true);
    });
  });

  it("lists a column by position then createdAt", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const a = await tasksRepo.create(tx, {
        caseId: cased.id,
        title: "A",
        status: "backlog",
      });
      const b = await tasksRepo.create(tx, {
        caseId: cased.id,
        title: "B",
        status: "backlog",
      });
      if (!a || !b) throw new Error("task");
      await tasksRepo.rewriteOrder(tx, cased.id, "backlog", [b.id, a.id]);
      const listed = await tasksRepo.listForCase(tx, cased.id, {
        status: "backlog",
      });
      expect(listed.map((row) => row.id)).toEqual([b.id, a.id]);
    });
  });

  it("rewriteOrder rejects invalid task ids without partial updates", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const a = await tasksRepo.create(tx, {
        caseId: cased.id,
        title: "A",
        status: "backlog",
      });
      const b = await tasksRepo.create(tx, {
        caseId: cased.id,
        title: "B",
        status: "backlog",
      });
      if (!a || !b) throw new Error("task");

      const ok = await tasksRepo.rewriteOrder(tx, cased.id, "backlog", [
        b.id,
        "not-a-uuid",
      ]);
      expect(ok).toBe(false);

      const listed = await tasksRepo.listForCase(tx, cased.id, {
        status: "backlog",
      });
      expect(listed.map((row) => row.id)).toEqual([a.id, b.id]);
    });
  });

  it("searchForCase matches attached entity display name", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(25),
        name: "Gamma LLC",
        slug: "gamma-llc",
      });
      const created = await tasksRepo.create(tx, {
        caseId: cased.id,
        entityId: entity.id,
        title: "Review filings",
        status: "backlog",
      });
      if (!created) throw new Error("task");

      const hits = await tasksRepo.searchForCase(tx, cased.id, "gamma llc", 10);
      expect(hits.some((row) => row.id === created.id)).toBe(true);
    });
  });

  it("searchForCase matches attached entity notes", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(26),
        name: "Delta Subject",
        slug: "delta-subject",
        notes: "Key witness for the fraud thread",
      });
      const created = await tasksRepo.create(tx, {
        caseId: cased.id,
        entityId: entity.id,
        title: "Schedule interview",
        status: "backlog",
      });
      if (!created) throw new Error("task");

      const hits = await tasksRepo.searchForCase(
        tx,
        cased.id,
        "fraud thread",
        10
      );
      expect(hits.some((row) => row.id === created.id)).toBe(true);
    });
  });

  it("searchForCase matches task status and priority", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await tasksRepo.create(tx, {
        caseId: cased.id,
        title: "Review filings",
        status: "done",
        priority: "high",
      });
      if (!created) throw new Error("task");

      const byStatus = await tasksRepo.searchForCase(tx, cased.id, "done", 10);
      expect(byStatus.some((row) => row.id === created.id)).toBe(true);

      const byPriority = await tasksRepo.searchForCase(
        tx,
        cased.id,
        "high",
        10
      );
      expect(byPriority.some((row) => row.id === created.id)).toBe(true);
    });
  });

  it("searchForCase matches task status and priority display labels", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await tasksRepo.create(tx, {
        caseId: cased.id,
        title: "Review filings",
        status: "in_progress",
        priority: "urgent",
      });
      if (!created) throw new Error("task");

      const byStatus = await tasksRepo.searchForCase(
        tx,
        cased.id,
        "In Progress",
        10
      );
      expect(byStatus.some((row) => row.id === created.id)).toBe(true);

      const byPriority = await tasksRepo.searchForCase(
        tx,
        cased.id,
        "Urgent",
        10
      );
      expect(byPriority.some((row) => row.id === created.id)).toBe(true);
    });
  });

  it("updateInCase rejects updates outside the case", async () => {
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx);
      const caseB = await seedCase(tx);
      const created = await tasksRepo.create(tx, {
        caseId: caseB.id,
        title: "Other case",
        status: "backlog",
      });
      if (!created) throw new Error("task");
      const updated = await tasksRepo.updateInCase(tx, caseA.id, created.id, {
        title: "cross-case",
      });
      expect(updated).toBeNull();
      const row = await tasksRepo.getInCase(tx, caseB.id, created.id);
      expect(row?.title).toBe("Other case");
    });
  });

  it("removeInCase rejects deletes outside the case", async () => {
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx);
      const caseB = await seedCase(tx);
      const created = await tasksRepo.create(tx, {
        caseId: caseB.id,
        title: "Do not delete",
        status: "backlog",
      });
      if (!created) throw new Error("task");
      expect(await tasksRepo.removeInCase(tx, caseA.id, created.id)).toBe(
        false
      );
      expect(
        await tasksRepo.getInCase(tx, caseB.id, created.id)
      ).not.toBeNull();
      expect(await tasksRepo.removeInCase(tx, caseB.id, created.id)).toBe(true);
      expect(await tasksRepo.getInCase(tx, caseB.id, created.id)).toBeNull();
    });
  });

  it("trims padded task title on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await tasksRepo.create(tx, {
        caseId: cased.id,
        title: "  Follow up  ",
        status: "backlog",
      });
      expect(created?.title).toBe("Follow up");
    });
  });

  it("rejects blank task title on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await tasksRepo.create(tx, {
        caseId: cased.id,
        title: "   ",
        status: "backlog",
      });
      expect(created).toBeNull();
    });
  });

  it("rejects invalid entityId on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await tasksRepo.create(tx, {
        caseId: cased.id,
        title: "Scoped task",
        status: "backlog",
        entityId: "ent-1",
      });
      expect(created).toBeNull();
    });
  });

  it("rejects invalid entityId on update", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await tasksRepo.create(tx, {
        caseId: cased.id,
        title: "Follow up",
        status: "backlog",
      });
      if (!created) throw new Error("task");
      const updated = await tasksRepo.update(tx, created.id, {
        entityId: "ent-1",
      });
      expect(updated).toBeNull();
    });
  });
});
