import { Effect, Layer } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ORGANIZATION_ID, testCaseId, testId } from "@watchdog/test-kit";

const CASE_ID = testCaseId(1);
const JOB_ID = testId(2);
const ACTOR_ID = "actor-1";

const { create, notifyEvent } = vi.hoisted(() => ({
  create: vi.fn(),
  notifyEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@watchdog/db", () => ({
  db: {},
  jobsRepo: { create },
  notifyEvent: (...args: unknown[]) => notifyEvent(...args),
}));

vi.mock("@watchdog/caps", () => ({
  requireCapability: () => ({
    input: { safeParse: (data: unknown) => ({ success: true, data }) },
    egress: "none",
    jobPolicy: {},
  }),
}));

vi.mock("../../evidence/evidence", () => ({
  assertEvidenceIdsInCaseEffect: () => Effect.void,
}));

vi.mock("../../graph/patch/guards", () => ({
  assertCaseInOrgEffect: (caseId: string) => Effect.succeed(caseId.trim()),
  assertEntityInCaseEffect: (_caseId: string, entityId: string) =>
    Effect.succeed(entityId.trim()),
  assertEvidenceInCaseEffect: (_caseId: string, evidenceId: string) =>
    Effect.succeed(evidenceId.trim()),
}));

vi.mock("../cap-availability", () => ({
  assertCapAvailabilityEffect: () => Effect.void,
}));

vi.mock("../../actors/resolve-actor-labels", () => ({
  loadActorUsersEffect: () => Effect.succeed(new Map()),
  labelForActor: (id: string) => id,
}));

import { Db } from "../../infra/db-service";
import { runDomainWith } from "../../infra/run-domain";
import { InvalidError } from "../../infra/tagged-errors";
import { fakeVault } from "../../infra/vault-fake";
import { recordingJobQueue } from "../job-queue";
import { startJobEffect, toJobRecord } from "../start-job";

const queue = recordingJobQueue();
const runDomain = runDomainWith(
  Layer.mergeAll(Db.layer, queue.layer, fakeVault().layer)
);

describe("startJobEffect", () => {
  beforeEach(() => {
    queue.sends.length = 0;
    create.mockClear();
    notifyEvent.mockClear();
  });

  it("notifies queued after enqueue", async () => {
    create.mockResolvedValueOnce({
      id: JOB_ID,
      caseId: CASE_ID,
      capabilityId: "network.dns.lookup",
      input: { host: "example.com" },
      output: null,
      status: "queued",
      error: null,
      interpretError: null,
      proposalId: null,
      evidenceIds: null,
      resultSummary: null,
      fromCache: false,
      suppressedCount: 0,
      actorId: ACTOR_ID,
      actorLabel: null,
      logs: [],
      playbookRunId: null,
      playbookStep: null,
      playbookFanIndex: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      startedAt: null,
      finishedAt: null,
    });

    await runDomain(
      startJobEffect({
        caseId: CASE_ID,
        organizationId: TEST_ORGANIZATION_ID,
        capabilityId: "network.dns.lookup",
        input: { host: "example.com" },
        actorId: ACTOR_ID,
      })
    );

    expect(queue.sends.map((s) => s.payload.jobId)).toEqual([JOB_ID]);
    expect(notifyEvent).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(notifyEvent).toHaveBeenCalledWith({
        type: "job_update",
        caseId: CASE_ID,
        jobId: JOB_ID,
        status: "queued",
      });
    });
  });

  it("rejects whitespace-only capability ids", async () => {
    await expect(
      runDomain(
        startJobEffect({
          caseId: CASE_ID,
          organizationId: TEST_ORGANIZATION_ID,
          capabilityId: "   ",
          input: { host: "example.com" },
          actorId: ACTOR_ID,
        })
      )
    ).rejects.toBeInstanceOf(InvalidError);
  });

  it("rejects blank actorId", async () => {
    await expect(
      runDomain(
        startJobEffect({
          caseId: CASE_ID,
          organizationId: TEST_ORGANIZATION_ID,
          capabilityId: "network.dns.lookup",
          input: { host: "example.com" },
          actorId: "   ",
        })
      )
    ).rejects.toMatchObject({
      _tag: "InvalidError",
      reason: "actorId is required",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("persists trimmed graph ids in job input", async () => {
    const entityId = "00000000-0000-4000-8000-000000000050";
    const evidenceId = "00000000-0000-4000-8000-000000000099";
    create.mockResolvedValueOnce({
      id: JOB_ID,
      caseId: CASE_ID,
      capabilityId: "network.dns.lookup",
      input: { entityId, evidenceId },
      output: null,
      status: "queued",
      error: null,
      interpretError: null,
      proposalId: null,
      evidenceIds: null,
      resultSummary: null,
      fromCache: false,
      suppressedCount: 0,
      actorId: ACTOR_ID,
      actorLabel: null,
      logs: [],
      playbookRunId: null,
      playbookStep: null,
      playbookFanIndex: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      startedAt: null,
      finishedAt: null,
    });

    await runDomain(
      startJobEffect({
        caseId: CASE_ID,
        organizationId: TEST_ORGANIZATION_ID,
        capabilityId: "network.dns.lookup",
        input: {
          entityId: `  ${entityId}  `,
          evidenceId: `  ${evidenceId}  `,
        },
        actorId: ACTOR_ID,
      })
    );

    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        input: { entityId, evidenceId },
      })
    );
  });
});

describe("toJobRecord", () => {
  it("normalizes padded evidence ids on wire records", () => {
    const evidenceId = "22222222-2222-4222-8222-000000000002";
    const now = new Date();
    const record = toJobRecord({
      id: "job-1",
      caseId: testCaseId(1),
      capabilityId: "network.dns.lookup",
      input: { host: "example.com" },
      output: null,
      status: "succeeded",
      error: null,
      interpretError: null,
      proposalId: null,
      evidenceIds: [`  ${evidenceId}  `, evidenceId, "  "],
      resultSummary: null,
      fromCache: false,
      suppressedCount: 0,
      actorId: ACTOR_ID,
      actorLabel: null,
      logs: [],
      playbookRunId: null,
      playbookStep: null,
      playbookFanIndex: 0,
      handoff: null,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      finishedAt: now,
    });
    expect(record.evidenceIds).toEqual([evidenceId]);
  });
});
