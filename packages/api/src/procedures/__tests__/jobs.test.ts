import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { listJobsForCaseEffect, startJobEffect } = vi.hoisted(() => ({
  listJobsForCaseEffect: vi.fn(),
  startJobEffect: vi.fn(),
}));

vi.mock("@watchdog/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core")>();
  return {
    ...actual,
    listJobsForCaseEffect,
    getJobForCaseEffect: vi.fn(),
    startJobEffect,
    cancelJobEffect: vi.fn(),
    cancelPlaybookRunEffect: vi.fn(),
    runPlaybookEffect: vi.fn(),
  };
});

import { listForCase, start, startPlaybook } from "../jobs";

const actor = {
  userId: "u1",
  email: "a@test.local",
  name: "Agent",
  organizationId: "org-test",
};

describe("jobs procedures", () => {
  it("lists jobs for a case", async () => {
    listJobsForCaseEffect.mockReturnValueOnce(
      Effect.succeed([
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
          playbookId: null,
          playbookRunStatus: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          startedAt: null,
          finishedAt: null,
        },
      ])
    );

    const client = createRouterClient(
      { listForCase },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(
      client.listForCase({
        caseId: "00000000-0000-4000-8000-000000000001",
      })
    ).resolves.toHaveLength(1);
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
        playbookId: null,
        playbookRunStatus: null,
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
          authMethod: "session",
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
          authMethod: "session",
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
          authMethod: "session",
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
});
