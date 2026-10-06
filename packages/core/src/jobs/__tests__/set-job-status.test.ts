import { beforeEach, describe, expect, it, vi } from "vitest";

import { testCaseId, untrustedCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const { update, updateInCase, append } = vi.hoisted(() => ({
  update: vi.fn(),
  updateInCase: vi.fn(),
  append: vi.fn(),
}));

vi.mock("@watchdog/db", () => ({
  // `transact` runs its body on a stand-in transaction handle.
  db: { transaction: (body: (tx: object) => unknown) => body({}) },
  jobsRepo: {
    update,
    updateInCase,
  },
  activityLogRepo: { append },
}));

import { runDomain } from "../../infra/run-domain";
import { setJobStatusEffect } from "../set-job-status";

describe("setJobStatus", () => {
  const caseId = testCaseId(10);
  const jobId = testId(20);

  beforeEach(() => {
    update.mockClear();
    updateInCase.mockReset();
    append.mockReset();
    append.mockResolvedValue({
      id: 1,
      xid: "1",
      caseId,
      kind: "job",
      action: "succeeded",
      subjectId: jobId,
      groupId: null,
      label: null,
      actorId: "actor",
      actorLabel: null,
      fromValue: null,
      toValue: "succeeded",
      createdAt: new Date(),
    });
  });

  it("returns null and appends nothing when update matches no row", async () => {
    updateInCase.mockResolvedValueOnce(null);
    const result = await runDomain(
      setJobStatusEffect(jobId, { status: "running" }, { caseId })
    );
    expect(result).toBeNull();
    expect(append).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("returns null for invalid scoped ids without calling the repo", async () => {
    const result = await runDomain(
      setJobStatusEffect(
        "job-1",
        { status: "running" },
        { caseId: untrustedCaseId("case-1") }
      )
    );
    expect(result).toBeNull();
    expect(updateInCase).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it("returns the updated row and appends its entry on the same handle", async () => {
    const tx = {};
    updateInCase.mockResolvedValueOnce({
      id: jobId,
      caseId,
      status: "succeeded",
      actorId: "actor",
      actorLabel: null,
      playbookRunId: testId(30),
    });
    const result = await runDomain(
      setJobStatusEffect(jobId, { status: "succeeded" }, { caseId })
    );
    expect(result?.status).toBe("succeeded");
    expect(updateInCase).toHaveBeenCalledWith(
      expect.anything(),
      caseId,
      jobId,
      { status: "succeeded" },
      { unlessCancelled: undefined, onlyStatuses: undefined }
    );
    expect(update).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith(
      updateInCase.mock.calls[0]?.[0] ?? tx,
      expect.objectContaining({
        caseId,
        kind: "job",
        action: "succeeded",
        subjectId: jobId,
        groupId: testId(30),
        toValue: "succeeded",
      })
    );
  });
});
