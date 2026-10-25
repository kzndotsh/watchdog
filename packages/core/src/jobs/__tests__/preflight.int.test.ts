import { Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { capVersion } from "@watchdog/caps";
import { deleteCaseEffect } from "@watchdog/core/cases";
import { Db, runDomain, runDomainWith } from "@watchdog/core/infra";
import { recordingJobQueue } from "@watchdog/core/jobs";
import { db, jobsRepo } from "@watchdog/db";
import {
  buildClaimCreateOp,
  TEST_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedJob,
  seedOrganizationMember,
  seedProposal,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

import { preflightEffect } from "../stages/preflight.ts";

/** The cancel's follow-up needs a queue to advance Playbook runs; a recording one stands in. */
const runWithQueue = runDomainWith(
  Layer.mergeAll(Db.layer, recordingJobQueue().layer)
);

describe("preflight", () => {
  beforeEach(async () => {
    await resetTestDb();
    // The preflight checks the Job's creator is still a member of the Case's organization.
    await seedOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "owner",
    });
  });

  it("stops when the job is missing", async () => {
    const result = await runDomain(preflightEffect(testId(99)));
    expect(result).toEqual({ kind: "stop", reason: "not_found" });
  });

  it("stops when the job is cancelled", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, {
      status: "cancelled",
      transitions: ["queued", "cancelled"],
    });
    const result = await runDomain(preflightEffect(job.id));
    expect(result).toEqual({ kind: "stop", reason: "cancelled" });
  });

  it("stops when the job is already terminal", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "succeeded" });
    const result = await runDomain(preflightEffect(job.id));
    expect(result).toEqual({ kind: "stop", reason: "already_terminal" });
  });

  it("converges a running job that already has a proposal", async () => {
    const cased = await seedCase(db);
    const { id: proposalId } = await seedProposal(db, cased.id, [
      buildClaimCreateOp(testId(20), "x", { id: testId(30) }),
    ]);
    const job = await seedJob(db, cased.id, {
      status: "running",
      capabilityId: "network.dns.lookup",
    });
    await jobsRepo.update(db, job.id, { proposalId });
    const result = await runDomain(preflightEffect(job.id));
    expect(result).toEqual({ kind: "stop", reason: "reclaim_converged" });
  });

  it("stops on unknown capability", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, {
      status: "queued",
      capabilityId: "not.a.real.cap",
    });
    const result = await runDomain(preflightEffect(job.id));
    expect(result).toEqual({ kind: "stop", reason: "unknown_capability" });
  });

  it("stops on invalid input", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, {
      status: "queued",
      capabilityId: "network.dns.lookup",
      input: { nope: true },
    });
    const result = await runDomain(preflightEffect(job.id));
    expect(result).toEqual({ kind: "stop", reason: "invalid_input" });
  });

  it("stops when third-party egress is denied", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, {
      status: "queued",
      capabilityId: "evidence.extract.ai",
      input: { evidenceId: testId(40) },
    });
    const result = await runDomain(preflightEffect(job.id));
    expect(result.kind).toBe("stop");
    if (result.kind !== "stop") return;
    expect(result.reason).toBe("egress_denied");
  });

  it("stops when extract.ai credentials are missing after egress is enabled", async () => {
    const cased = await seedCase(db, { allowThirdPartyEgress: true });
    const job = await seedJob(db, cased.id, {
      status: "queued",
      capabilityId: "evidence.extract.ai",
      input: { evidenceId: testId(41) },
    });
    const result = await runDomain(preflightEffect(job.id));
    expect(result.kind).toBe("stop");
    if (result.kind !== "stop") return;
    expect(result.reason).toBe("missing_credential");
  });

  describe("Cap version stamp", () => {
    const artifacts = [
      {
        name: "report.json",
        mime: "application/json",
        uri: "case/report.json",
        sha256: "ab".repeat(32),
      },
    ];

    it("stamps the running code's version when a Job is claimed", async () => {
      const cased = await seedCase(db);
      const job = await seedJob(db, cased.id, {
        status: "queued",
        capabilityId: "network.dns.lookup",
        input: { host: "example.com" },
      });

      const result = await runDomain(preflightEffect(job.id));

      const expected = capVersion("network.dns.lookup");
      expect(result.kind === "ready" && result.state.capVersion).toBe(expected);
      expect((await jobsRepo.get(db, job.id))?.capVersion).toBe(expected);
    });

    it("keeps the claimed version when a reclaim reuses the earlier run's artifacts", async () => {
      const cased = await seedCase(db);
      const job = await seedJob(db, cased.id, {
        status: "running",
        capabilityId: "network.dns.lookup",
        input: { host: "example.com" },
        output: artifacts,
      });
      await jobsRepo.update(db, job.id, {
        capVersion: "claimed-before-deploy",
      });

      const result = await runDomain(preflightEffect(job.id));

      expect(result.kind === "ready" && result.state.capVersion).toBe(
        "claimed-before-deploy"
      );
      expect((await jobsRepo.get(db, job.id))?.capVersion).toBe(
        "claimed-before-deploy"
      );
    });

    it("stamps the running code's version when a reclaim starts the run over", async () => {
      const cased = await seedCase(db);
      const job = await seedJob(db, cased.id, {
        status: "running",
        capabilityId: "network.dns.lookup",
        input: { host: "example.com" },
      });
      await jobsRepo.update(db, job.id, {
        capVersion: "claimed-before-deploy",
      });

      await runDomain(preflightEffect(job.id));

      expect((await jobsRepo.get(db, job.id))?.capVersion).toBe(
        capVersion("network.dns.lookup")
      );
    });
  });

  describe("delivery of an act Job (at most once)", () => {
    const ACT_CAP = "archive.url.submit";
    const actInput = { url: "https://example.com/page" };

    it("does nothing for an act Job that is already running", async () => {
      const cased = await seedCase(db, { allowThirdPartyEgress: true });
      const job = await seedJob(db, cased.id, {
        status: "running",
        capabilityId: ACT_CAP,
        input: actInput,
      });

      const result = await runDomain(preflightEffect(job.id));

      expect(result).toEqual({ kind: "stop", reason: "act_in_flight" });
      const row = await jobsRepo.get(db, job.id);
      expect(row?.status).toBe("running");
      expect(row?.error).toBeNull();
    });

    it("does nothing for a running act Job even when egress is now denied", async () => {
      const cased = await seedCase(db, { allowThirdPartyEgress: false });
      const job = await seedJob(db, cased.id, {
        status: "running",
        capabilityId: ACT_CAP,
        input: actInput,
      });

      const result = await runDomain(preflightEffect(job.id));

      expect(result).toEqual({ kind: "stop", reason: "act_in_flight" });
      expect((await jobsRepo.get(db, job.id))?.status).toBe("running");
    });

    it("starts a queued act Job", async () => {
      const cased = await seedCase(db, { allowThirdPartyEgress: true });
      const job = await seedJob(db, cased.id, {
        status: "queued",
        capabilityId: ACT_CAP,
        input: actInput,
      });

      const result = await runDomain(preflightEffect(job.id));

      expect(result.kind).toBe("ready");
      expect((await jobsRepo.get(db, job.id))?.status).toBe("running");
    });

    it("still reclaims a lookup Job that was running, since a lookup is safe to repeat", async () => {
      const cased = await seedCase(db);
      const job = await seedJob(db, cased.id, {
        status: "running",
        capabilityId: "network.dns.lookup",
      });

      const result = await runDomain(preflightEffect(job.id));

      expect(result.kind).toBe("ready");
    });
  });

  it("cancels a Job that landed on a deleted Case instead of running it", async () => {
    await seedOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "owner",
    });
    const cased = await seedCase(db);
    await runWithQueue(
      deleteCaseEffect(cased.id, {
        organizationId: TEST_ORGANIZATION_ID,
        actorId: TEST_ACTOR_ID,
      })
    );
    // Queued after the delete cancelled the Case's work (a late enqueue).
    const job = await seedJob(db, cased.id, { status: "queued" });

    const result = await runDomain(preflightEffect(job.id));

    expect(result).toEqual({ kind: "stop", reason: "case_deleted" });
    expect((await jobsRepo.get(db, job.id))?.status).toBe("cancelled");
  });
});
