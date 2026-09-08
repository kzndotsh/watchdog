import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const {
  lockInCase,
  reject,
  getInCase,
  listNamesByIdsInCase,
  listIdentifiersForCase,
  recordRejectedFingerprintsEffect,
  notifyEvent,
} = vi.hoisted(() => ({
  lockInCase: vi.fn(),
  reject: vi.fn(),
  getInCase: vi.fn(),
  listNamesByIdsInCase: vi.fn().mockResolvedValue([]),
  listIdentifiersForCase: vi.fn().mockResolvedValue([]),
  recordRejectedFingerprintsEffect: vi.fn(),
  notifyEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@watchdog/db", () => ({
  db: {},
  proposalsRepo: {
    lockInCase,
    reject,
    getInCase,
  },
  entitiesRepo: {
    listNamesByIdsInCase,
  },
  identifiersRepo: {
    listForCase: listIdentifiersForCase,
  },
  notifyEvent: (...args: unknown[]) => notifyEvent(...args),
}));

vi.mock("../finding-suppress", () => ({
  recordRejectedFingerprintsEffect: (...args: unknown[]) =>
    recordRejectedFingerprintsEffect(...args),
}));

vi.mock("../../graph/patch/guards", () => ({
  assertCaseInOrgEffect: (caseId: string) => Effect.succeed(caseId.trim()),
  requireTrimmedGraphId: (value: string) => Effect.succeed(value.trim()),
}));

vi.mock("../../actors/resolve-actor-labels", () => ({
  loadActorUsersEffect: () => Effect.succeed(new Map()),
  labelForActor: (id: string) => id,
}));

vi.mock("../../infra/postgres-effect", () => ({
  tryDb: (fn: () => Promise<unknown>) => Effect.tryPromise({ try: fn }),
}));

vi.mock("../../infra/postgres-tx", () => ({
  transact: (fn: (tx: unknown) => Effect.Effect<unknown>) => fn({}),
}));

import { rejectProposalEffect } from "../proposals";

describe("rejectProposalEffect", () => {
  it("notifies proposal_queue_changed after reject commits", async () => {
    const caseId = "00000000-0000-4000-8000-000000000001";
    const proposalId = "00000000-0000-4000-8000-000000000002";
    const row = {
      id: proposalId,
      caseId,
      jobId: null,
      status: "rejected" as const,
      summary: "test",
      patch: [],
      rejectReason: null,
      createdBy: "actor-1",
      decidedBy: "actor-1",
      createdAt: new Date(),
      decidedAt: new Date(),
      suppressedCount: 0,
      evidenceIds: [],
      agentSourced: false,
      userOverridden: false,
    };

    lockInCase.mockResolvedValueOnce({
      id: proposalId,
      status: "pending",
    });
    reject.mockResolvedValueOnce(row);
    getInCase.mockResolvedValueOnce({
      proposal: row,
      capabilityId: "network.dns.lookup",
      playbookId: null,
    });
    recordRejectedFingerprintsEffect.mockReturnValueOnce(Effect.void);

    await Effect.runPromise(
      rejectProposalEffect({
        caseId,
        organizationId: "org-1",
        proposalId,
        actorId: "actor-1",
      })
    );

    expect(getInCase).toHaveBeenCalled();
    expect(notifyEvent).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(notifyEvent).toHaveBeenCalledWith({
        type: "proposal_queue_changed",
        caseId,
      });
    });
  });
});
