import { describe, expect, it } from "vitest";

import { classifyRun } from "../run-outcome";

const JOB_ID = "11111111-1111-4111-8111-000000000001";

describe("classifyRun", () => {
  it("drops a stale timeout reason when the body finished before the interrupt landed", () => {
    expect(
      classifyRun({
        jobId: JOB_ID,
        threw: false,
        peekReason: () => "timeout",
      })
    ).toEqual({ outcome: "succeeded" });
  });

  it("fails a run that threw after a timeout and keeps the reason", () => {
    expect(
      classifyRun({
        jobId: JOB_ID,
        threw: true,
        peekReason: () => "timeout",
      })
    ).toEqual({ outcome: "failed", abortReason: "timeout" });
  });

  it("reports a cancelled finish with the cancel reason", () => {
    expect(
      classifyRun({
        jobId: JOB_ID,
        finishOutcome: "cancelled",
        threw: false,
        peekReason: () => undefined,
      })
    ).toEqual({ outcome: "cancelled", abortReason: "cancel" });
  });
});
