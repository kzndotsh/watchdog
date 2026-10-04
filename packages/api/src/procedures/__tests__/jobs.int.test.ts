import { beforeEach, describe, expect, it } from "vitest";

import { runDomain } from "@watchdog/core/infra";
import { listJobsForCaseEffect, startJobEffect } from "@watchdog/core/jobs";
import { resetTestDb, seedCase, testDb } from "@watchdog/test-db";
import { TEST_ACTOR_ID, TEST_ORGANIZATION_ID } from "@watchdog/test-kit";

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
