import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { listProposalsForCaseEffect } = vi.hoisted(() => ({
  listProposalsForCaseEffect: vi.fn(),
}));

vi.mock("@watchdog/core/proposals", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@watchdog/core/proposals")>();
  return {
    ...actual,
    listProposalsForCaseEffect,
    createAgentProposalEffect: vi.fn(),
    acceptProposalEffect: vi.fn(),
    rejectProposalEffect: vi.fn(),
  };
});

import { TEST_ORGANIZATION_ID, testActor } from "@watchdog/schemas/testing";

import { listForCase } from "../proposals";

const actor = testActor();

describe("proposals procedures", () => {
  it("lists proposals for a case", async () => {
    listProposalsForCaseEffect.mockReturnValueOnce(
      Effect.succeed({
        items: [
          {
            id: "00000000-0000-4000-8000-000000000070",
            caseId: "00000000-0000-4000-8000-000000000001",
            jobId: null,
            capabilityId: null,
            playbookId: null,
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
            createdBy: "u1",
            createdByLabel: "u1",
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
    expect(listProposalsForCaseEffect).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      TEST_ORGANIZATION_ID,
      { cursor: undefined, limit: 50 }
    );
  });

  it("filters by status when provided", async () => {
    listProposalsForCaseEffect.mockReturnValueOnce(
      Effect.succeed({ items: [], nextCursor: null })
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

    await client.listForCase({
      caseId: "00000000-0000-4000-8000-000000000001",
      status: "pending",
    });

    expect(listProposalsForCaseEffect).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      TEST_ORGANIZATION_ID,
      { status: "pending", cursor: undefined, limit: 50 }
    );
  });
});
