import { describe, expect, it } from "vitest";

import {
  TEST_ORGANIZATION_ID,
  buildClaimCreateOp,
  testId,
} from "@watchdog/test-kit";
import {
  seedCase,
  seedEntity,
  seedEvidence,
  seedJob,
  seedPlaybookRun,
  seedProposal,
  withTestTx,
} from "@watchdog/test-kit/db";

import { activityRepo } from "../activity.repo.ts";

describe("activityRepo", () => {
  it("lists recent evidence activity for a case", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const evidence = await seedEvidence(tx, cased.id, {
        label: "note",
      });
      const recent = await activityRepo.recentEvidence(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        limit: 10,
      });
      expect(recent.some((row) => row.id === evidence.id)).toBe(true);
    });
  });

  it("includes playbookId for playbook jobs", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const run = await seedPlaybookRun(tx, cased.id, {
        playbookId: "host-footprint-lite",
        seed: { host: "example.com" },
      });
      const job = await seedJob(tx, cased.id, {
        playbookRunId: run.id,
        playbookStep: 0,
        capabilityId: "network.dns.lookup",
        input: { host: "example.com" },
      });
      const recent = await activityRepo.recentJobs(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        limit: 10,
      });
      const row = recent.find((entry) => entry.id === job.id);
      expect(row?.playbookId).toBe("host-footprint-lite");
    });
  });

  it("includes playbookId for proposals linked to playbook jobs", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(25) });
      const run = await seedPlaybookRun(tx, cased.id, {
        playbookId: "host-footprint-lite",
      });
      const job = await seedJob(tx, cased.id, {
        playbookRunId: run.id,
        capabilityId: "network.dns.lookup",
      });
      const proposal = await seedProposal(
        tx,
        cased.id,
        [buildClaimCreateOp(entity.id, "observed", { id: testId(35) })],
        { jobId: job.id }
      );

      const recent = await activityRepo.recentPendingProposals(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        limit: 10,
      });
      const row = recent.find((entry) => entry.id === proposal.id);
      expect(row?.playbookId).toBe("host-footprint-lite");
    });
  });

  it("returns no rows when caseId is blank whitespace", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      await seedEvidence(tx, cased.id, { label: "note" });

      const recent = await activityRepo.recentEvidence(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        caseId: "   ",
        limit: 10,
      });
      expect(recent).toEqual([]);
    });
  });
});
