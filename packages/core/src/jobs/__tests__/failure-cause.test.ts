import { beforeEach, describe, expect, it, vi } from "vitest";

const { logSwallowed } = vi.hoisted(() => ({ logSwallowed: vi.fn() }));

vi.mock("../../infra/process-log", () => ({ logSwallowed }));

import {
  ConflictError,
  InternalError,
  InvalidError,
} from "../../infra/tagged-errors";
import { logJobFailureCause } from "../failure-cause";

describe("logJobFailureCause", () => {
  beforeEach(() => {
    logSwallowed.mockClear();
  });

  it("logs the cause of an InvalidError next to the fixed reason", () => {
    logJobFailureCause(
      "job-1",
      new InvalidError({ reason: "oEmbed lookup failed", cause: "HTTP 403 x" })
    );
    expect(logSwallowed).toHaveBeenCalledWith(
      "job.failure_cause",
      "HTTP 403 x",
      {
        jobId: "job-1",
        domainTag: "InvalidError",
        reason: "oEmbed lookup failed",
      }
    );
  });

  it("logs the original fault of an InternalError", () => {
    const fault = new Error("ECONNRESET");
    logJobFailureCause(
      "job-2",
      new InternalError({ reason: "Tool failed unexpectedly", cause: fault })
    );
    expect(logSwallowed).toHaveBeenCalledWith(
      "job.failure_cause",
      fault,
      expect.objectContaining({ jobId: "job-2", domainTag: "InternalError" })
    );
  });

  it("stays quiet when there is no cause", () => {
    logJobFailureCause("job-3", new InvalidError({ reason: "bad" }));
    logJobFailureCause("job-3", new ConflictError({ reason: "dup" }));
    expect(logSwallowed).not.toHaveBeenCalled();
  });
});
