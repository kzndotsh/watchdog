import { Layer } from "effect";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import { createCaseEffect, deleteCaseEffect } from "@watchdog/core/cases";
import { InternalError } from "@watchdog/core/errors";
import { casesRepo, db } from "@watchdog/db";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedOrganizationMember,
  testDb,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import { Db } from "../../infra/db-service";
import { runDomain, runDomainWith } from "../../infra/run-domain";
import { recordingJobQueue } from "../../jobs/job-queue";

let spy: MockInstance | undefined;

/** The cancel's follow-up needs a queue to advance Playbook runs; a recording one stands in. */
const runWithQueue = runDomainWith(
  Layer.mergeAll(Db.layer, recordingJobQueue().layer)
);

describe("failed Case writes", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterEach(() => {
    spy?.mockRestore();
    spy = undefined;
  });

  it("raises InternalError when an insert returns no row", async () => {
    spy = vi.spyOn(casesRepo, "create").mockResolvedValueOnce(null);

    await expect(
      runDomain(
        createCaseEffect({
          name: "Alpha",
          organizationId: TEST_ORGANIZATION_ID,
        })
      )
    ).rejects.toBeInstanceOf(InternalError);
  });

  it("raises InternalError when the tombstone of a locked Case writes no row", async () => {
    await seedOrganizationMember(testDb, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "owner",
    });
    const seeded = await seedCase(db, { name: "Alpha" });
    spy = vi.spyOn(casesRepo, "tombstone").mockResolvedValueOnce(null);

    await expect(
      runWithQueue(
        deleteCaseEffect(seeded.id, {
          organizationId: TEST_ORGANIZATION_ID,
          actorId: TEST_ACTOR_ID,
        })
      )
    ).rejects.toBeInstanceOf(InternalError);
  });
});
