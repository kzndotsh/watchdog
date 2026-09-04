import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { listJobsForCaseEffect } = vi.hoisted(() => ({
  listJobsForCaseEffect: vi.fn(),
}));

vi.mock("@watchdog/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core")>();
  return {
    ...actual,
    listJobsForCaseEffect,
    getJobForCaseEffect: vi.fn(),
    startJobEffect: vi.fn(),
    cancelJobEffect: vi.fn(),
    cancelPlaybookRunEffect: vi.fn(),
    runPlaybookEffect: vi.fn(),
  };
});

import { listForCase } from "../jobs";

const actor = { userId: "u1", email: "a@test.local", name: "Agent" };

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
});
