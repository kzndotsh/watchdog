import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const {
  listJobsForCaseEffect,
  startJobEffect,
  retryJobEffect,
  getPlaybookRunForCaseEffect,
} = vi.hoisted(() => ({
  listJobsForCaseEffect: vi.fn(),
  startJobEffect: vi.fn(),
  retryJobEffect: vi.fn(),
  getPlaybookRunForCaseEffect: vi.fn(),
}));

vi.mock("@watchdog/core/jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/jobs")>();
  return {
    ...actual,
    listJobsForCaseEffect,
    getJobForCaseEffect: vi.fn(),
    getPlaybookRunForCaseEffect,
    startJobEffect,
    retryJobEffect,
    cancelJobEffect: vi.fn(),
    cancelPlaybookRunEffect: vi.fn(),
    runPlaybookEffect: vi.fn(),
  };
});

import { testActor } from "@watchdog/schemas/testing";

import {
  getPlaybookRun,
  listForCase,
  retry,
  start,
  startPlaybook,
} from "../jobs";

const actor = testActor();

describe("jobs procedures", () => {
  it("lists jobs for a case", async () => {
    listJobsForCaseEffect.mockReturnValueOnce(
      Effect.succeed({
        items: [
          {
            id: "00000000-0000-4000-8000-000000000060",
            caseId: "00000000-0000-4000-8000-000000000001",
            capabilityId: "network.dns.lookup",
            input: {},
            output: null,
            status: "queued",
            error: null,
            interpretError: null,
            proposalId: null,
            evidenceIds: null,
            resultSummary: null,
            fromCache: false,
            suppressedCount: 0,
            actorId: "u1",
            actorLabel: "u1",
            playbookRunId: null,
            playbookStep: null,
            playbookFanIndex: 0,
            retryOfJobId: null,
            playbookId: null,
            playbookRunStatus: null,
            playbookRunOutcome: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            startedAt: null,
            finishedAt: null,
          },
        ],
        nextCursor: null,
      })
    );

    const client = createRouterClient(
      { listForCase },
      {
        context: {
          headers: new Headers(),
          actor,
          credential: { kind: "session" },
        },
      }
    );

    await expect(
      client.listForCase({
        caseId: "00000000-0000-4000-8000-000000000001",
      })
    ).resolves.toHaveProperty("items.length", 1);
  });

  it("normalizes padded graph ids in job input before start", async () => {
    const entityId = "00000000-0000-4000-8000-000000000020";
    const evidenceId = "00000000-0000-4000-8000-000000000030";
    startJobEffect.mockReturnValueOnce(
      Effect.succeed({
        id: "00000000-0000-4000-8000-000000000060",
        caseId: "00000000-0000-4000-8000-000000000001",
        capabilityId: "network.dns.lookup",
        input: { host: "example.com", entityId, evidenceId },
        output: null,
        status: "queued",
        error: null,
        interpretError: null,
        proposalId: null,
        evidenceIds: null,
        resultSummary: null,
        fromCache: false,
        suppressedCount: 0,
        actorId: "u1",
        actorLabel: "u1",
        playbookRunId: null,
        playbookStep: null,
        playbookFanIndex: 0,
        retryOfJobId: null,
        playbookId: null,
        playbookRunStatus: null,
        playbookRunOutcome: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        startedAt: null,
        finishedAt: null,
        logs: [],
      })
    );

    const client = createRouterClient(
      { start },
      {
        context: {
          headers: new Headers(),
          actor,
          credential: { kind: "session" },
        },
      }
    );

    await client.start({
      caseId: "00000000-0000-4000-8000-000000000001",
      capabilityId: "network.dns.lookup",
      input: {
        host: "example.com",
        entityId: ` ${entityId} `,
        evidenceId: ` ${evidenceId} `,
      },
    });

    expect(startJobEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          host: "example.com",
          entityId,
          evidenceId,
        },
      })
    );
  });

  it("rejects playbook runs with an empty seed object", async () => {
    const client = createRouterClient(
      { startPlaybook },
      {
        context: {
          headers: new Headers(),
          actor,
          credential: { kind: "session" },
        },
      }
    );

    await expect(
      client.startPlaybook({
        caseId: "00000000-0000-4000-8000-000000000001",
        playbookId: "host-footprint",
        seed: {},
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
    });
  });

  it("rejects job start when input contains an invalid entityId", async () => {
    startJobEffect.mockClear();
    const client = createRouterClient(
      { start },
      {
        context: {
          headers: new Headers(),
          actor,
          credential: { kind: "session" },
        },
      }
    );

    await expect(
      client.start({
        caseId: "00000000-0000-4000-8000-000000000001",
        capabilityId: "network.dns.lookup",
        input: { host: "example.com", entityId: "ent-1" },
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
    });
    expect(startJobEffect).not.toHaveBeenCalled();
  });

  it("retries a Job as the calling actor in their organization", async () => {
    const jobId = "00000000-0000-4000-8000-000000000060";
    const caseId = "00000000-0000-4000-8000-000000000001";
    retryJobEffect.mockReturnValueOnce(
      Effect.succeed({
        id: "00000000-0000-4000-8000-000000000061",
        caseId,
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
        actorId: "u1",
        actorLabel: "u1",
        playbookRunId: null,
        playbookStep: null,
        playbookFanIndex: 0,
        retryOfJobId: jobId,
        playbookId: null,
        playbookRunStatus: null,
        playbookRunOutcome: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        startedAt: null,
        finishedAt: null,
        logs: [],
      })
    );
    const client = createRouterClient(
      { retry },
      {
        context: {
          headers: new Headers(),
          actor,
          credential: { kind: "session" },
        },
      }
    );

    const retried = await client.retry({ caseId, jobId: ` ${jobId} ` });

    expect(retried.retryOfJobId).toBe(jobId);
    expect(retryJobEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId,
        jobId,
        organizationId: actor.organizationId,
        actorId: actor.userId,
      })
    );
  });

  it("rejects a retry whose job id is not a uuid", async () => {
    retryJobEffect.mockClear();
    const client = createRouterClient(
      { retry },
      {
        context: {
          headers: new Headers(),
          actor,
          credential: { kind: "session" },
        },
      }
    );

    await expect(
      client.retry({
        caseId: "00000000-0000-4000-8000-000000000001",
        jobId: "job-1",
      })
    ).rejects.toMatchObject({ message: "Input validation failed" });
    expect(retryJobEffect).not.toHaveBeenCalled();
  });

  it("reads a playbook run's step outcomes in the caller's organization", async () => {
    const caseId = "00000000-0000-4000-8000-000000000001";
    const playbookRunId = "00000000-0000-4000-8000-000000000070";
    const run = {
      id: playbookRunId,
      caseId,
      playbookId: "domain-triage",
      status: "finished",
      outcome: "partial",
      createdAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:01:00.000Z",
      steps: [
        {
          step: 0,
          capabilityId: "network.dns.lookup",
          state: "failed",
          jobIds: ["00000000-0000-4000-8000-000000000060"],
        },
        {
          step: 1,
          capabilityId: "network.ct.lookup",
          state: "skipped",
          reason: "step 0 (network.dns.lookup) failed",
          jobIds: [],
        },
      ],
    };
    getPlaybookRunForCaseEffect.mockReturnValueOnce(Effect.succeed(run));
    const client = createRouterClient(
      { getPlaybookRun },
      {
        context: {
          headers: new Headers(),
          actor,
          credential: { kind: "session" },
        },
      }
    );

    const read = await client.getPlaybookRun({
      caseId,
      playbookRunId: ` ${playbookRunId} `,
    });

    expect(read).toEqual(run);
    expect(getPlaybookRunForCaseEffect).toHaveBeenCalledWith(
      caseId,
      actor.organizationId,
      playbookRunId
    );
  });
});
