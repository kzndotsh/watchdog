import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

const { update, updateInCase, notifyEvent } = vi.hoisted(() => ({
  update: vi.fn(),
  updateInCase: vi.fn(),
  notifyEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@watchdog/db", () => ({
  db: {},
  jobsRepo: {
    update,
    updateInCase,
  },
  notifyEvent: (...args: unknown[]) => notifyEvent(...args),
}));

import { setJobStatusEffect } from "../set-job-status";

describe("setJobStatus", () => {
  const caseId = testId(10);
  const jobId = testId(20);

  it("returns null when update matches no row", async () => {
    updateInCase.mockResolvedValueOnce(null);
    const result = await Effect.runPromise(
      setJobStatusEffect(jobId, { status: "running" }, { caseId })
    );
    expect(result).toBeNull();
    expect(notifyEvent).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("trims padded job and case ids before updating", async () => {
    updateInCase.mockResolvedValueOnce({
      id: jobId,
      caseId,
      status: "running",
    });
    await Effect.runPromise(
      setJobStatusEffect(
        `  ${jobId}  `,
        { status: "running" },
        { caseId: `  ${caseId}  ` }
      )
    );
    expect(updateInCase).toHaveBeenCalledWith(
      {},
      caseId,
      jobId,
      { status: "running" },
      { unlessCancelled: undefined, onlyStatuses: undefined }
    );
  });

  it("returns null for invalid scoped ids without calling the repo", async () => {
    updateInCase.mockClear();
    const result = await Effect.runPromise(
      setJobStatusEffect("job-1", { status: "running" }, { caseId: "case-1" })
    );
    expect(result).toBeNull();
    expect(updateInCase).not.toHaveBeenCalled();
  });

  it("returns updated row and optionally notifies", async () => {
    update.mockClear();
    updateInCase.mockClear();
    updateInCase.mockResolvedValueOnce({
      id: jobId,
      caseId,
      status: "completed",
    });
    const result = await Effect.runPromise(
      setJobStatusEffect(
        jobId,
        { status: "completed" },
        { notify: true, caseId }
      )
    );
    expect(result?.status).toBe("completed");
    expect(updateInCase).toHaveBeenCalledWith(
      {},
      caseId,
      jobId,
      { status: "completed" },
      { unlessCancelled: undefined, onlyStatuses: undefined }
    );
    expect(update).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(notifyEvent).toHaveBeenCalledWith({
        type: "job_update",
        caseId,
        jobId,
        status: "completed",
      });
    });
  });
});
