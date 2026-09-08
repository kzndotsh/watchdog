import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { PatchOp } from "@watchdog/schemas";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

const { create } = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("@watchdog/db", () => ({
  db: {},
  proposalsRepo: { create },
}));

import { proposeStageEffect } from "../propose";

describe("proposeStage", () => {
  const caseId = testId(1);
  const jobId = testId(2);
  const evidenceId = testId(3);

  it("returns null proposalId when patch is empty", async () => {
    const result = await Effect.runPromise(
      proposeStageEffect({
        caseId,
        kept: [],
        suppressed: 2,
        resultSummary: "none new",
        attachEvidenceIds: [],
      })
    );
    expect(result.proposalId).toBeNull();
    expect(result.suppressedCount).toBe(2);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates pending proposal with evidence attached", async () => {
    create.mockResolvedValueOnce({ id: testId(4) });
    const kept: PatchOp[] = [
      {
        op: "create",
        resource: "claim",
        data: { text: "observation", class: "observation" },
      },
    ];

    const result = await Effect.runPromise(
      proposeStageEffect({
        caseId,
        kept,
        suppressed: 0,
        resultSummary: "found claim",
        attachEvidenceIds: [evidenceId],
        jobId,
      })
    );

    expect(result.proposalId).toBe(testId(4));
    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        caseId,
        jobId,
        status: "pending",
        evidenceIds: [evidenceId],
      })
    );
  });

  it("trims padded attach evidence ids before insert", async () => {
    create.mockResolvedValueOnce({ id: testId(5) });
    const kept: PatchOp[] = [
      {
        op: "create",
        resource: "claim",
        data: { text: "observation", class: "observation" },
      },
    ];

    await Effect.runPromise(
      proposeStageEffect({
        caseId,
        kept,
        suppressed: 0,
        resultSummary: "found claim",
        attachEvidenceIds: [`  ${evidenceId}  `, evidenceId],
      })
    );

    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        evidenceIds: [evidenceId],
      })
    );
  });

  it("trims padded createdBy before insert", async () => {
    create.mockResolvedValueOnce({ id: testId(6) });
    const kept: PatchOp[] = [
      {
        op: "create",
        resource: "claim",
        data: { text: "observation", class: "observation" },
      },
    ];

    await Effect.runPromise(
      proposeStageEffect({
        caseId,
        kept,
        suppressed: 0,
        resultSummary: "found claim",
        attachEvidenceIds: [evidenceId],
        createdBy: `  ${TEST_ACTOR_ID}  `,
      })
    );

    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        createdBy: TEST_ACTOR_ID,
      })
    );
  });

  it("stores null createdBy when only whitespace is provided", async () => {
    create.mockResolvedValueOnce({ id: testId(7) });
    const kept: PatchOp[] = [
      {
        op: "create",
        resource: "claim",
        data: { text: "observation", class: "observation" },
      },
    ];

    await Effect.runPromise(
      proposeStageEffect({
        caseId,
        kept,
        suppressed: 0,
        resultSummary: "found claim",
        attachEvidenceIds: [evidenceId],
        createdBy: "   ",
      })
    );

    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        createdBy: null,
      })
    );
  });

  it("returns null proposalId when repo create misses", async () => {
    create.mockResolvedValueOnce(null);
    const kept: PatchOp[] = [
      {
        op: "create",
        resource: "claim",
        data: { text: "observation", class: "observation" },
      },
    ];

    const result = await Effect.runPromise(
      proposeStageEffect({
        caseId,
        kept,
        suppressed: 0,
        resultSummary: "found claim",
        attachEvidenceIds: [evidenceId],
        createdBy: TEST_ACTOR_ID,
      })
    );

    expect(result.proposalId).toBeNull();
  });

  it("rejects invalid attach evidence ids", async () => {
    const kept: PatchOp[] = [
      {
        op: "create",
        resource: "claim",
        data: { text: "observation", class: "observation" },
      },
    ];

    await expect(
      Effect.runPromise(
        proposeStageEffect({
          caseId,
          kept,
          suppressed: 0,
          resultSummary: "found claim",
          attachEvidenceIds: [evidenceId, "not-a-uuid"],
        })
      )
    ).rejects.toMatchObject({
      _tag: "InvalidError",
      reason: "attachEvidenceIds contains an invalid UUID",
    });
  });
});
