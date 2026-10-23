import { randomUUID } from "node:crypto";

import { Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { recordingBlobStore } from "@watchdog/core/blob";
import { JobStartLimitError } from "@watchdog/core/errors";
import { Db, runDomainWith } from "@watchdog/core/infra";
import { recordingJobQueue, startJobEffect } from "@watchdog/core/jobs";
import { getJobStartLimitsEffect } from "@watchdog/core/organization";
import { vaultLayer } from "@watchdog/core/vault";
import {
  db,
  jobStartCountersRepo,
  jobStartLimitsRepo,
  jobsRepo,
} from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedApiKey,
  seedCase,
  seedOrganizationMember,
  twoWriters,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

// Enqueues land in a recording queue instead of a real pg-boss.
const queue = recordingJobQueue();
const runDomain = runDomainWith(
  Layer.mergeAll(
    Layer.provideMerge(vaultLayer, Db.layer),
    queue.layer,
    recordingBlobStore().layer
  )
);

function start(caseId: CaseId, actorKeyId?: string) {
  return runDomain(
    startJobEffect({
      caseId,
      organizationId: TEST_ORGANIZATION_ID,
      capabilityId: "network.dns.lookup",
      actorId: TEST_ACTOR_ID,
      actorKeyId,
      input: { host: "mailhost.test" },
    })
  );
}

async function jobCount(caseId: CaseId): Promise<number> {
  return (await jobsRepo.listForCase(db, caseId, { limit: 100 })).length;
}

function reason(result: PromiseSettledResult<unknown>): unknown {
  if (result.status !== "rejected") {
    throw new Error("expected the writer to fail");
  }
  return result.reason;
}

/**
 * A is parked right after it counted its start and before it commits, holding the counter row.
 * B's start for the same organization must wait for that row, then see A's count.
 */
function raceOnTheCounter() {
  const race = twoWriters({ pauseAt: "counted" });
  race.pauseAfter(jobStartCountersRepo, "take", "counted");
  return race;
}

describe("Job start limit under two concurrent writers", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seedOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "member",
    });
    queue.sends.length = 0;
  });

  it("two starts at the last free slot: one is admitted, the other waits and is refused", async () => {
    const cased = await seedCase(db);
    await jobStartLimitsRepo.setForOrganization(db, TEST_ORGANIZATION_ID, 1);

    const outcome = await raceOnTheCounter().run({
      a: () => start(cased.id),
      b: () => start(cased.id),
    });

    expect(outcome.bBlocked).toBe(true);
    expect(outcome.a.status).toBe("fulfilled");
    expect(reason(outcome.b)).toBeInstanceOf(JobStartLimitError);
    expect(reason(outcome.b)).toMatchObject({
      scope: "organization",
      limit: 1,
    });
    expect(await jobCount(cased.id)).toBe(1);
    expect(queue.sends).toHaveLength(1);
    const state = await runDomain(
      getJobStartLimitsEffect({ organizationId: TEST_ORGANIZATION_ID })
    );
    expect(state.organization.used).toBe(1);
  });

  it("two starts with one slot to spare past the first: both are admitted", async () => {
    const cased = await seedCase(db);
    await jobStartLimitsRepo.setForOrganization(db, TEST_ORGANIZATION_ID, 2);

    const outcome = await raceOnTheCounter().run({
      a: () => start(cased.id),
      b: () => start(cased.id),
    });

    expect(outcome.bBlocked).toBe(true);
    expect(outcome.a.status).toBe("fulfilled");
    expect(outcome.b.status).toBe("fulfilled");
    expect(await jobCount(cased.id)).toBe(2);
  });

  it("a key at its limit refuses the waiting start and gives the organization's count back", async () => {
    const cased = await seedCase(db);
    const keyId = `wd480-${randomUUID()}`;
    await seedApiKey(db, { id: keyId, ownerId: TEST_ACTOR_ID });
    await jobStartLimitsRepo.setForKey(db, TEST_ORGANIZATION_ID, keyId, 1);

    const outcome = await raceOnTheCounter().run({
      a: () => start(cased.id, keyId),
      b: () => start(cased.id, keyId),
    });

    expect(outcome.bBlocked).toBe(true);
    expect(outcome.a.status).toBe("fulfilled");
    expect(reason(outcome.b)).toMatchObject({ scope: "key", limit: 1 });
    expect(await jobCount(cased.id)).toBe(1);
    const state = await runDomain(
      getJobStartLimitsEffect({
        organizationId: TEST_ORGANIZATION_ID,
        actorKeyId: keyId,
      })
    );
    expect(state.organization.used).toBe(1);
    expect(state.key?.used).toBe(1);
  });
});
