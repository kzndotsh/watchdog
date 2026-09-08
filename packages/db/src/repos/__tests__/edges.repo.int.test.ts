import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";
import { seedCase, seedEntity, withTestTx } from "@watchdog/test-kit/db";

import { edgesRepo } from "../edges.repo.ts";

describe("edgesRepo", () => {
  it("lists endpoint names for a case-scoped edge", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const from = await seedEntity(tx, cased.id, {
        id: testId(20),
        name: "From",
        slug: "from",
      });
      const to = await seedEntity(tx, cased.id, {
        id: testId(21),
        name: "To",
        slug: "to",
      });
      const created = await edgesRepo.create(tx, {
        fromId: from.id,
        toId: to.id,
        predicate: "owns",
        confidence: "unverified",
        notes: null,
      });
      if (!created) throw new Error("edge");
      const listed = await edgesRepo.listForCase(tx, cased.id);
      const row = listed.find((item) => item.id === created.id);
      expect(row?.fromName).toBe("From");
      expect(row?.toName).toBe("To");
    });
  });

  it("getInCase requires both endpoints in the case", async () => {
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx, { slug: "edge-case-a" });
      const caseB = await seedCase(tx, { slug: "edge-case-b" });
      const from = await seedEntity(tx, caseA.id, {
        id: testId(22),
        slug: "from-a",
      });
      const to = await seedEntity(tx, caseB.id, {
        id: testId(23),
        slug: "to-b",
      });
      const created = await edgesRepo.create(tx, {
        fromId: from.id,
        toId: to.id,
        predicate: "owns",
        confidence: "unverified",
        notes: null,
      });
      if (!created) throw new Error("edge");
      expect(await edgesRepo.getInCase(tx, caseA.id, created.id)).toBeNull();
      expect(await edgesRepo.getInCase(tx, caseB.id, created.id)).toBeNull();
    });
  });

  it("updateInCase rejects updates outside the case", async () => {
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx);
      const caseB = await seedCase(tx);
      const from = await seedEntity(tx, caseB.id, {
        id: testId(24),
        slug: "from-b",
      });
      const to = await seedEntity(tx, caseB.id, {
        id: testId(25),
        slug: "to-b",
      });
      const created = await edgesRepo.create(tx, {
        fromId: from.id,
        toId: to.id,
        predicate: "owns",
        confidence: "unverified",
        notes: null,
      });
      if (!created) throw new Error("edge");
      const updated = await edgesRepo.updateInCase(tx, caseA.id, created.id, {
        notes: "cross-case",
      });
      expect(updated).toBeNull();
      const row = await edgesRepo.getInCase(tx, caseB.id, created.id);
      expect(row?.notes).toBeNull();
    });
  });

  it("listOutboundForEntity scopes edges to the case", async () => {
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx, { slug: "outbound-a" });
      const caseB = await seedCase(tx, { slug: "outbound-b" });
      const fromA = await seedEntity(tx, caseA.id, {
        id: testId(28),
        slug: "from-a-out",
      });
      const toA = await seedEntity(tx, caseA.id, {
        id: testId(29),
        slug: "to-a-out",
      });
      const toB = await seedEntity(tx, caseB.id, {
        id: testId(30),
        slug: "to-b-out",
      });
      const inCase = await edgesRepo.create(tx, {
        fromId: fromA.id,
        toId: toA.id,
        predicate: "owns",
        confidence: "unverified",
        notes: null,
      });
      const crossCase = await edgesRepo.create(tx, {
        fromId: fromA.id,
        toId: toB.id,
        predicate: "related_to",
        confidence: "unverified",
        notes: null,
      });
      if (!inCase || !crossCase) throw new Error("edge");

      const outbound = await edgesRepo.listOutboundForEntity(
        tx,
        caseA.id,
        fromA.id
      );
      expect(outbound.map((row) => row.id)).toEqual([inCase.id]);
    });
  });

  it("deleteInCase rejects deletes outside the case", async () => {
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx);
      const caseB = await seedCase(tx);
      const from = await seedEntity(tx, caseB.id, {
        id: testId(26),
        slug: "from-b-del",
      });
      const to = await seedEntity(tx, caseB.id, {
        id: testId(27),
        slug: "to-b-del",
      });
      const created = await edgesRepo.create(tx, {
        fromId: from.id,
        toId: to.id,
        predicate: "owns",
        confidence: "unverified",
        notes: null,
      });
      if (!created) throw new Error("edge");
      expect(await edgesRepo.deleteInCase(tx, caseA.id, created.id)).toBe(
        false
      );
      expect(
        await edgesRepo.getInCase(tx, caseB.id, created.id)
      ).not.toBeNull();
      expect(await edgesRepo.deleteInCase(tx, caseB.id, created.id)).toBe(true);
      expect(await edgesRepo.getInCase(tx, caseB.id, created.id)).toBeNull();
    });
  });

  it("trims padded edge notes on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const from = await seedEntity(tx, cased.id, {
        id: testId(28),
        slug: "from-trim",
      });
      const to = await seedEntity(tx, cased.id, {
        id: testId(29),
        slug: "to-trim",
      });
      const created = await edgesRepo.create(tx, {
        fromId: from.id,
        toId: to.id,
        predicate: "owns",
        confidence: "unverified",
        notes: "  subsidiary  ",
      });
      expect(created?.notes).toBe("subsidiary");
    });
  });

  it("create rejects invalid endpoint ids", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const to = await seedEntity(tx, cased.id, { id: testId(31), slug: "to" });
      const created = await edgesRepo.create(tx, {
        fromId: "not-a-uuid",
        toId: to.id,
        predicate: "owns",
        confidence: "unverified",
        notes: null,
      });
      expect(created).toBeNull();
    });
  });

  it("update rejects invalid endpoint ids", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const from = await seedEntity(tx, cased.id, {
        id: testId(32),
        slug: "from",
      });
      const to = await seedEntity(tx, cased.id, {
        id: testId(33),
        slug: "to",
      });
      const created = await edgesRepo.create(tx, {
        fromId: from.id,
        toId: to.id,
        predicate: "owns",
        confidence: "unverified",
        notes: null,
      });
      if (!created) throw new Error("edge");
      const updated = await edgesRepo.update(tx, created.id, {
        fromId: "bad",
      });
      expect(updated).toBeNull();
    });
  });
});
