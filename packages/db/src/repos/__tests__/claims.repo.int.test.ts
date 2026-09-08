import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";
import { seedCase, seedEntity, withTestTx } from "@watchdog/test-kit/db";

import { claimsRepo } from "../claims.repo.ts";

describe("claimsRepo", () => {
  it("retracts a claim and hides it from the default list", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(20) });
      const created = await claimsRepo.create(tx, {
        entityId: entity.id,
        text: "Ada observed a host",
        class: "observation",
        confidence: "unverified",
      });
      if (!created) throw new Error("claim");
      await claimsRepo.retract(tx, created.id, {
        retractKind: "retracted",
        retractedReason: "nope",
        retractedBy: "test-actor",
      });
      const listed = await claimsRepo.listForEntity(tx, entity.id);
      expect(listed.some((row) => row.id === created.id)).toBe(false);
      const all = await claimsRepo.listForEntity(tx, entity.id, {
        includeRetracted: true,
      });
      expect(all.some((row) => row.id === created.id && row.retracted)).toBe(
        true
      );
    });
  });

  it("updateInCase rejects updates outside the case", async () => {
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx);
      const caseB = await seedCase(tx);
      const entityB = await seedEntity(tx, caseB.id, { id: testId(21) });
      const created = await claimsRepo.create(tx, {
        entityId: entityB.id,
        text: "Other case claim",
        class: "observation",
        confidence: "unverified",
      });
      if (!created) throw new Error("claim");
      const updated = await claimsRepo.updateInCase(tx, caseA.id, created.id, {
        text: "cross-case",
      });
      expect(updated).toBeNull();
      const row = await claimsRepo.getInCase(tx, caseB.id, created.id);
      expect(row?.text).toBe("Other case claim");
    });
  });

  it("retractInCase rejects retraction outside the case", async () => {
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx);
      const caseB = await seedCase(tx);
      const entityB = await seedEntity(tx, caseB.id, { id: testId(22) });
      const created = await claimsRepo.create(tx, {
        entityId: entityB.id,
        text: "Do not retract cross-case",
        class: "observation",
        confidence: "unverified",
      });
      if (!created) throw new Error("claim");
      const retracted = await claimsRepo.retractInCase(
        tx,
        caseA.id,
        created.id,
        {
          retractKind: "retracted",
          retractedReason: "nope",
          retractedBy: "test-actor",
        }
      );
      expect(retracted).toBeNull();
      const row = await claimsRepo.getInCase(tx, caseB.id, created.id);
      expect(row?.retracted).toBe(false);
    });
  });

  it("trims padded claim text on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(23) });
      const created = await claimsRepo.create(tx, {
        entityId: entity.id,
        text: "  Ada observed a host  ",
        class: "observation",
        confidence: "unverified",
      });
      expect(created?.text).toBe("Ada observed a host");
    });
  });

  it("rejects blank claim text on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(24) });
      const created = await claimsRepo.create(tx, {
        entityId: entity.id,
        text: "   ",
        class: "observation",
        confidence: "unverified",
      });
      expect(created).toBeNull();
    });
  });

  it("trims padded retractedBy on retractInCase", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(25) });
      const created = await claimsRepo.create(tx, {
        entityId: entity.id,
        text: "Retract me",
        class: "observation",
        confidence: "unverified",
      });
      if (!created) throw new Error("claim");
      const retracted = await claimsRepo.retractInCase(
        tx,
        cased.id,
        created.id,
        {
          retractKind: "retracted",
          retractedReason: "nope",
          retractedBy: "  test-actor  ",
        }
      );
      expect(retracted?.retractedBy).toBe("test-actor");
    });
  });

  it("stores null retractedBy when actor id is blank", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(26) });
      const created = await claimsRepo.create(tx, {
        entityId: entity.id,
        text: "No actor",
        class: "observation",
        confidence: "unverified",
      });
      if (!created) throw new Error("claim");
      const retracted = await claimsRepo.retractInCase(
        tx,
        cased.id,
        created.id,
        {
          retractKind: "retracted",
          retractedReason: "nope",
          retractedBy: "   ",
        }
      );
      expect(retracted?.retractedBy).toBeNull();
    });
  });
});
