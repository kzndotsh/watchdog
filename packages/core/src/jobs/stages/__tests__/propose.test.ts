import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { PatchOp } from "@watchdog/schemas";

const { create } = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("@watchdog/db", () => ({
  db: {},
  proposalsRepo: { create },
}));

import { proposeStageEffect } from "../propose";

describe("proposeStage", () => {
  it("returns null proposalId when patch is empty", async () => {
    const result = await Effect.runPromise(
      proposeStageEffect({
        caseId: "case-1",
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
    create.mockResolvedValueOnce({ id: "prop-1" });
    const kept: PatchOp[] = [
      {
        op: "create",
        resource: "claim",
        data: { text: "observation", class: "observation" },
      },
    ];

    const result = await Effect.runPromise(
      proposeStageEffect({
        caseId: "case-1",
        kept,
        suppressed: 0,
        resultSummary: "found claim",
        attachEvidenceIds: ["ev-1"],
        jobId: "job-1",
      })
    );

    expect(result.proposalId).toBe("prop-1");
    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        caseId: "case-1",
        jobId: "job-1",
        status: "pending",
        evidenceIds: ["ev-1"],
      })
    );
  });
});
