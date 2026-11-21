import { describe, expect, it } from "vitest";

import { jobWideEventFields } from "../fields";

describe("jobWideEventFields", () => {
  it("includes jobId and outcome", () => {
    const fields = jobWideEventFields({
      jobId: "job-1",
      outcome: "succeeded",
      caseId: "case-1",
    });
    expect(fields.job.jobId).toBe("job-1");
    expect(fields.job.outcome).toBe("succeeded");
    expect(fields.case?.caseId).toBe("case-1");
  });

  it("omits case when caseId is missing", () => {
    const fields = jobWideEventFields({
      jobId: "job-1",
      outcome: "failed",
    });
    expect(fields.case).toBeUndefined();
  });

  it("never includes arbitrary extra secret fields in the return shape", () => {
    const fields = jobWideEventFields({
      jobId: "job-1",
      outcome: "succeeded",
    });
    expect(Object.keys(fields).sort()).toEqual(["cap", "case", "job"].sort());
    expect(JSON.stringify(fields)).not.toMatch(/secret|password|apiKey/i);
  });

  it("trims padded log ids and drops blank case ids", () => {
    const fields = jobWideEventFields({
      jobId: "  job-1  ",
      outcome: "succeeded",
      caseId: "   ",
      capabilityId: "  cap.dns  ",
      playbookRunId: "  run-1  ",
    });
    expect(fields.job.jobId).toBe("job-1");
    expect(fields.case).toBeUndefined();
    expect(fields.cap).toEqual({
      capabilityId: "cap.dns",
      playbookRunId: "run-1",
    });
  });
});
