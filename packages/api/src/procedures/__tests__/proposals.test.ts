import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { listProposalsForCaseEffect } = vi.hoisted(() => ({
  listProposalsForCaseEffect: vi.fn(),
}));

vi.mock("@watchdog/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core")>();
  return {
    ...actual,
    listProposalsForCaseEffect,
    createAgentProposalEffect: vi.fn(),
    acceptProposalEffect: vi.fn(),
    rejectProposalEffect: vi.fn(),
  };
});

import { listForCase } from "../proposals";

const actor = {
  userId: "u1",
  email: "a@test.local",
  name: "Agent",
  organizationId: "org-test",
};

describe("proposals procedures", () => {
  it("lists proposals for a case", async () => {
    listProposalsForCaseEffect.mockReturnValueOnce(
      Effect.succeed([
        {
          id: "00000000-0000-4000-8000-000000000070",
          caseId: "00000000-0000-4000-8000-000000000001",
          jobId: null,
          capabilityId: null,
          status: "pending",
          patch: [],
          summary: "Add identifier",
          suppressedCount: 0,
          evidenceIds: [],
          rejectReason: null,
          decidedBy: null,
          decidedByLabel: null,
          decidedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          agentSourced: true,
          userOverridden: false,
          createdBy: "u1",
          createdByLabel: "u1",
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
    expect(listProposalsForCaseEffect).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      "org-test",
      undefined
    );
  });

  it("filters by status when provided", async () => {
    listProposalsForCaseEffect.mockReturnValueOnce(Effect.succeed([]));

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

    await client.listForCase({
      caseId: "00000000-0000-4000-8000-000000000001",
      status: "pending",
    });

    expect(listProposalsForCaseEffect).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      "org-test",
      { status: "pending" }
    );
  });
});
