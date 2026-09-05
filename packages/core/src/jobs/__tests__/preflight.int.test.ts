import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { casesRepo, db, jobsRepo } from "@watchdog/db";
import { buildClaimCreateOp, testId } from "@watchdog/test-kit";
import {
  resetTestDb,
  seedCase,
  seedJob,
  seedProposal,
} from "@watchdog/test-kit/db";

import { preflightEffect } from "../stages/preflight.ts";

describe("preflight", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("stops when the job is missing", async () => {
    const result = await Effect.runPromise(preflightEffect(testId(99)));
    expect(result).toEqual({ kind: "stop", reason: "not_found" });
  });

  it("stops when the job is cancelled", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "cancelled" });
    const result = await Effect.runPromise(preflightEffect(job.id));
    expect(result).toEqual({ kind: "stop", reason: "cancelled" });
  });

  it("stops when the job is already terminal", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "succeeded" });
    const result = await Effect.runPromise(preflightEffect(job.id));
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
    const result = await Effect.runPromise(preflightEffect(job.id));
    expect(result).toEqual({ kind: "stop", reason: "reclaim_converged" });
  });

  it("stops on unknown capability", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, {
      status: "queued",
      capabilityId: "not.a.real.cap",
    });
    const result = await Effect.runPromise(preflightEffect(job.id));
    expect(result).toEqual({ kind: "stop", reason: "unknown_capability" });
  });

  it("stops on invalid input", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, {
      status: "queued",
      capabilityId: "network.dns.lookup",
      input: { nope: true },
    });
    const result = await Effect.runPromise(preflightEffect(job.id));
    expect(result).toEqual({ kind: "stop", reason: "invalid_input" });
  });

  it("stops when third-party egress is denied", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, {
      status: "queued",
      capabilityId: "evidence.extract.ai",
      input: { evidenceId: testId(40) },
    });
    const result = await Effect.runPromise(preflightEffect(job.id));
    expect(result.kind).toBe("stop");
    if (result.kind !== "stop") return;
    expect(result.reason).toBe("egress_denied");
  });

  it("stops when extract.ai credentials are missing after egress is enabled", async () => {
    const cased = await seedCase(db);
    await casesRepo.update(db, cased.id, cased.organizationId, {
      allowThirdPartyEgress: true,
    });
    const job = await seedJob(db, cased.id, {
      status: "queued",
      capabilityId: "evidence.extract.ai",
      input: { evidenceId: testId(41) },
    });
    const result = await Effect.runPromise(preflightEffect(job.id));
    expect(result.kind).toBe("stop");
    if (result.kind !== "stop") return;
    expect(result.reason).toBe("missing_credential");
  });
});
