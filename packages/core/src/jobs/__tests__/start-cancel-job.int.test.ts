import { beforeEach, describe, expect, it } from "vitest";

import {
  DomainError,
  cancelJobEffect,
  getJobForCaseEffect,
  startJobEffect,
  runDomain,
} from "@watchdog/core";
import { db } from "@watchdog/db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";
import {
  resetTestDb,
  seedAuthUser,
  seedCase,
  seedJob,
} from "@watchdog/test-kit/db";

describe("startJob", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("inserts a queued dns lookup", async () => {
    const cased = await seedCase(db);
    const job = await runDomain(
      startJobEffect({
        caseId: cased.id,
        capabilityId: "network.dns.lookup",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        input: { host: "mailhost.test" },
      })
    );
    expect(job.status).toBe("queued");
    const reread = await runDomain(getJobForCaseEffect(cased.id, job.id));
    expect(reread?.id).toBe(job.id);
    expect(reread?.status).toBe("queued");
    expect(reread?.input).toEqual({ host: "mailhost.test" });
    expect(reread?.actorLabel).toBe(TEST_ACTOR_ID);
  });

  it("resolves actorLabel from auth.user", async () => {
    const cased = await seedCase(db);
    const userId = crypto.randomUUID();
    await seedAuthUser(db, {
      id: userId,
      name: "Ada",
      email: `ada-${userId}@mailhost.test`,
    });
    const job = await runDomain(
      startJobEffect({
        caseId: cased.id,
        capabilityId: "network.dns.lookup",
        actorId: userId,
        input: { host: "mailhost.test" },
      })
    );
    expect(job.actorLabel).toBe("ada");
  });
});

describe("cancelJob", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("cancels a queued job and rejects a succeeded one", async () => {
    const cased = await seedCase(db);
    const queued = await seedJob(db, cased.id, { status: "queued" });
    const cancelled = await runDomain(cancelJobEffect(cased.id, queued.id));
    expect(cancelled.status).toBe("cancelled");

    const done = await seedJob(db, cased.id, { status: "succeeded" });
    await expect(
      runDomain(cancelJobEffect(cased.id, done.id))
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "conflict"
    );
  });
});
