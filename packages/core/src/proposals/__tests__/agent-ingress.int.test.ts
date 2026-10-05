import { beforeEach, describe, expect, it } from "vitest";

import { isDomainTag } from "@watchdog/core/errors";
import { runDomain } from "@watchdog/core/infra";
import { writeGraphFromAgentEffect } from "@watchdog/core/proposals";
import { claimsRepo, db, evidenceRepo, graphWritesRepo } from "@watchdog/db";
import {
  buildClaimCreateOp,
  buildEntityCreateOp,
  TEST_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import { resetTestDb, seedCase, seedEntity } from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

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
        organizationId: TEST_ORGANIZATION_ID,
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
      organizationId: TEST_ORGANIZATION_ID,
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
          organizationId: TEST_ORGANIZATION_ID,
          actorId: TEST_ACTOR_ID,
          actorLabel: TEST_ACTOR_ID,
          userOverride: true,
          patch: [],
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "invalid"
    );

    const rows = await graphWritesRepo.listForCase(db, cased.id);
    expect(rows).toHaveLength(0);
  });

  it("surfaces an Entity id already in use as a conflict (not a failed write) without an idempotency key", async () => {
    const cased = await seedCase(db);
    const existing = await seedEntity(db, cased.id, { id: testId(23) });

    await expect(
      runDomain(
        writeGraphFromAgentEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          actorId: TEST_ACTOR_ID,
          actorLabel: TEST_ACTOR_ID,
          userOverride: true,
          patch: [
            buildEntityCreateOp("Dup", "dup-slug", "person", {
              id: existing.id,
            }),
          ],
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) =>
        isDomainTag(error) &&
        error.code === "conflict" &&
        error.message.includes("already in use")
    );
    expect(await graphWritesRepo.listForCase(db, cased.id)).toHaveLength(0);
  });

  it("surfaces the conflict when a keyed write conflicts and no earlier write holds the key", async () => {
    const cased = await seedCase(db);
    const existing = await seedEntity(db, cased.id, { id: testId(24) });

    await expect(
      runDomain(
        writeGraphFromAgentEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          actorId: TEST_ACTOR_ID,
          actorLabel: TEST_ACTOR_ID,
          userOverride: true,
          patch: [
            buildEntityCreateOp("Dup", "dup-slug-2", "person", {
              id: existing.id,
            }),
          ],
          idempotencyKey: "never-recorded",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "conflict"
    );
  });

  describe("concurrency", () => {
    it("returns the same writeId when two calls share a key", async () => {
      const cased = await seedCase(db);
      const entity = await seedEntity(db, cased.id, { id: testId(22) });
      const input = {
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
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
