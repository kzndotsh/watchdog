import { describe, expect, it } from "vitest";

import { TEST_ACTOR_ID, buildClaimCreateOp, testId } from "@watchdog/test-kit";
import { seedCase, seedEntity, withTestTx } from "@watchdog/test-kit/db";

import { graphWritesRepo } from "../graph-writes.repo.ts";

const IDEM_INDEX = "graph_writes_case_actor_idem_uidx";

function isPgUniqueOn(error: unknown, indexName: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    const record = current as {
      code?: unknown;
      constraint?: unknown;
      constraint_name?: unknown;
      cause?: unknown;
    };
    if (record.code === "23505") {
      const constraint =
        (typeof record.constraint_name === "string" &&
          record.constraint_name) ||
        (typeof record.constraint === "string" && record.constraint) ||
        "";
      if (constraint.includes(indexName)) return true;
    }
    current = record.cause;
  }
  return false;
}

describe("graphWritesRepo", () => {
  it("returns the first id from findIdByIdempotency after create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(20) });
      const created = await graphWritesRepo.create(tx, {
        caseId: cased.id,
        actorId: TEST_ACTOR_ID,
        channel: "agent_write",
        userOverridden: true,
        confidence: "unverified",
        summary: null,
        patch: [buildClaimCreateOp(entity.id, "Ada", { id: testId(30) })],
        idempotencyKey: "k1",
      });
      expect(created).not.toBeNull();
      if (created === null) {
        throw new TypeError("expected graph write");
      }

      const found = await graphWritesRepo.findIdByIdempotency(tx, {
        caseId: cased.id,
        actorId: TEST_ACTOR_ID,
        idempotencyKey: "k1",
      });
      expect(found).toBe(created.id);

      const row = await graphWritesRepo.get(tx, created.id);
      expect(row?.channel).toBe("agent_write");
      expect(row?.idempotencyKey).toBe("k1");
    });
  });

  it("create trims idempotencyKey for lookup", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(21) });
      const created = await graphWritesRepo.create(tx, {
        caseId: cased.id,
        actorId: TEST_ACTOR_ID,
        channel: "agent_write",
        userOverridden: true,
        confidence: "unverified",
        summary: null,
        patch: [buildClaimCreateOp(entity.id, "Bob", { id: testId(31) })],
        idempotencyKey: "  k2  ",
      });
      expect(created).not.toBeNull();
      if (created === null) {
        throw new TypeError("expected graph write");
      }

      const found = await graphWritesRepo.findIdByIdempotency(tx, {
        caseId: cased.id,
        actorId: TEST_ACTOR_ID,
        idempotencyKey: "k2",
      });
      expect(found).toBe(created.id);

      const row = await graphWritesRepo.get(tx, created.id);
      expect(row?.idempotencyKey).toBe("k2");
    });
  });

  it("trims padded summary and actorLabel on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(22) });
      const created = await graphWritesRepo.create(tx, {
        caseId: cased.id,
        actorId: TEST_ACTOR_ID,
        actorLabel: "  Ada  ",
        channel: "agent_write",
        userOverridden: true,
        confidence: "unverified",
        summary: "  Linked domains  ",
        patch: [buildClaimCreateOp(entity.id, "Ada", { id: testId(32) })],
        idempotencyKey: null,
      });
      expect(created).not.toBeNull();
      const row = created ? await graphWritesRepo.get(tx, created.id) : null;
      expect(row?.summary).toBe("Linked domains");
      expect(row?.actorLabel).toBe("Ada");
    });
  });

  it("throws a unique violation when creating a second row with the same case actor key", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const values = {
        caseId: cased.id,
        actorId: TEST_ACTOR_ID,
        channel: "agent_write" as const,
        userOverridden: true,
        confidence: "unverified" as const,
        summary: null,
        patch: [],
        idempotencyKey: "dup",
      };
      await graphWritesRepo.create(tx, values);
      await expect(graphWritesRepo.create(tx, values)).rejects.toSatisfy(
        (error: unknown) => isPgUniqueOn(error, IDEM_INDEX)
      );
    });
  });
});
