import { beforeEach, describe, expect, it } from "vitest";

import {
  DomainError,
  writeGraphFromAgentEffect,
  runDomain,
} from "@watchdog/core";
import { claimsRepo, db, evidenceRepo, graphWritesRepo } from "@watchdog/db";
import { TEST_ACTOR_ID, buildClaimCreateOp, testId } from "@watchdog/test-kit";
import { resetTestDb, seedCase, seedEntity } from "@watchdog/test-kit/db";

describe("writeGraphFromAgent", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("persists an unverified graph write and the claim row", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });
    const claimId = testId(30);

    const written = await runDomain(
      writeGraphFromAgentEffect({
        caseId: cased.id,
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        userOverride: true,
        patch: [
          buildClaimCreateOp(entity.id, "Ada observed a host", { id: claimId }),
        ],
        summary: "agent cite",
        idempotencyKey: "write-1",
      })
    );

    expect(written.replayed).toBe(false);
    expect(written.confidence).toBe("unverified");
    expect(written.opCount).toBe(1);

    const audit = await graphWritesRepo.get(db, written.writeId);
    expect(audit?.channel).toBe("agent_write");
    expect(audit?.userOverridden).toBe(true);
    expect(audit?.confidence).toBe("unverified");

    const claims = await claimsRepo.listForEntity(db, entity.id);
    expect(claims.some((row) => row.text === "Ada observed a host")).toBe(true);

    const evidence = await evidenceRepo.listForCase(db, cased.id);
    expect(evidence.some((row) => row.text === "agent cite")).toBe(true);
  });

  it("replays the same idempotency key without a second claim", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(21) });
    const patch = [
      buildClaimCreateOp(entity.id, "Once only", { id: testId(31) }),
    ];
    const input = {
      caseId: cased.id,
      actorId: TEST_ACTOR_ID,
      actorLabel: TEST_ACTOR_ID,
      userOverride: true as const,
      patch,
      idempotencyKey: "same-key",
    };

    const first = await runDomain(writeGraphFromAgentEffect(input));
    const second = await runDomain(writeGraphFromAgentEffect(input));

    expect(second.replayed).toBe(true);
    expect(second.opCount).toBe(0);
    expect(second.writeId).toBe(first.writeId);

    const claims = await claimsRepo.listForEntity(db, entity.id);
    expect(claims.filter((row) => row.text === "Once only")).toHaveLength(1);
  });

  it("throws invalid and writes no audit row when the patch is empty", async () => {
    const cased = await seedCase(db);

    await expect(
      runDomain(
        writeGraphFromAgentEffect({
          caseId: cased.id,
          actorId: TEST_ACTOR_ID,
          actorLabel: TEST_ACTOR_ID,
          userOverride: true,
          patch: [],
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );

    const rows = await graphWritesRepo.listForCase(db, cased.id);
    expect(rows).toHaveLength(0);
  });

  describe("concurrency", () => {
    it("returns the same writeId when two calls share a key", async () => {
      const cased = await seedCase(db);
      const entity = await seedEntity(db, cased.id, { id: testId(22) });
      const input = {
        caseId: cased.id,
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        userOverride: true as const,
        patch: [
          buildClaimCreateOp(entity.id, "Race claim", { id: testId(32) }),
        ],
        idempotencyKey: "race-key",
      };

      const results = await Promise.all([
        runDomain(writeGraphFromAgentEffect(input)),
        runDomain(writeGraphFromAgentEffect(input)),
      ]);
      expect(new Set(results.map((row) => row.writeId)).size).toBe(1);

      const claims = await claimsRepo.listForEntity(db, entity.id);
      expect(claims.filter((row) => row.text === "Race claim")).toHaveLength(1);
    });
  });
});
