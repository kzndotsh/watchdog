import { beforeEach, describe, expect, it } from "vitest";

import {
  listJobsForCaseEffect,
  startJobEffect,
  runDomain,
} from "@watchdog/core";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";
import { resetTestDb, seedCase, testDb } from "@watchdog/test-kit/db";

describe("jobs (core services)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("starts a dns lookup and lists it for the case", async () => {
    const cased = await seedCase(testDb);
    const job = await runDomain(
      startJobEffect({
        caseId: cased.id,
        capabilityId: "network.dns.lookup",
        actorId: TEST_ACTOR_ID,
        input: { host: "mailhost.test" },
      })
    );
    expect(job.status).toBe("queued");
    const listed = await runDomain(listJobsForCaseEffect(cased.id));
    expect(listed.some((row) => row.id === job.id)).toBe(true);
  });
});
