import { describe, expect, it } from "vitest";

import {
  expectPostgresRefusal,
  PG_FOREIGN_KEY_VIOLATION,
  seedCase,
  seedEntity,
  withTestTx,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

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
        caseId: cased.id,
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

  it("create refuses an Edge whose endpoints are in different Cases", async () => {
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
      await expectPostgresRefusal(
        edgesRepo.create(tx, {
          fromId: from.id,
          caseId: caseA.id,
          toId: to.id,
          predicate: "owns",
          confidence: "unverified",
          notes: null,
        }),
        {
          code: PG_FOREIGN_KEY_VIOLATION,
          constraint: "edges_to_id_case_id_fk",
        }
      );
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
        caseId: caseB.id,
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
        caseId: caseA.id,
        toId: toA.id,
        predicate: "owns",
        confidence: "unverified",
        notes: null,
      });
      // Another Case's Edge, on its own Entities, must not show up either.
      const otherCase = await edgesRepo.create(tx, {
        fromId: toB.id,
        caseId: caseB.id,
        toId: toB.id,
        predicate: "same_as",
        confidence: "unverified",
        notes: null,
      });
      if (!inCase || !otherCase) throw new Error("edge");

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
        caseId: caseB.id,
        toId: to.id,
        predicate: "owns",
        confidence: "unverified",
        notes: null,
      });
      if (!created) throw new Error("edge");
      expect(await edgesRepo.deleteInCase(tx, caseA.id, created.id)).toBeNull();
      expect(
        await edgesRepo.getInCase(tx, caseB.id, created.id)
      ).not.toBeNull();
      expect(
        await edgesRepo.deleteInCase(tx, caseB.id, created.id)
      ).toMatchObject({ id: created.id, predicate: "owns" });
      expect(await edgesRepo.getInCase(tx, caseB.id, created.id)).toBeNull();
    });
  });

  it("create rejects invalid endpoint ids", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const to = await seedEntity(tx, cased.id, { id: testId(31), slug: "to" });
      const created = await edgesRepo.create(tx, {
        fromId: "not-a-uuid",
        caseId: cased.id,
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
        caseId: cased.id,
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
