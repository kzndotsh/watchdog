import { Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { Db, runDomainWith } from "@watchdog/core/infra";
import {
  recordingJobQueue,
  listJobsForCaseEffect,
  startJobEffect,
} from "@watchdog/core/jobs";
import { resetTestDb, seedCase, testDb } from "@watchdog/test-db";
import { TEST_ACTOR_ID, TEST_ORGANIZATION_ID } from "@watchdog/test-kit";

// Enqueues land in a recording queue instead of a real pg-boss.
const queue = recordingJobQueue();
const runDomain = runDomainWith(Layer.mergeAll(Db.layer, queue.layer));

describe("jobs (core services)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("starts a dns lookup and lists it for the case", async () => {
    const cased = await seedCase(testDb);
    const job = await runDomain(
      startJobEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        capabilityId: "network.dns.lookup",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        input: { host: "mailhost.test" },
      })
    );
    expect(job.status).toBe("queued");
    const listed = await runDomain(
      listJobsForCaseEffect(cased.id, TEST_ORGANIZATION_ID)
    );
    expect(listed.some((row) => row.id === job.id)).toBe(true);
  });
});
