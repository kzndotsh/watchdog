import { describe, expect, it, vi } from "vitest";

vi.mock("@/domains/jobs/jobs.functions", () => ({
  getJobFn: vi.fn(),
  listCapabilitiesFn: vi.fn(),
  listJobsFn: vi.fn(),
  listPlaybooksFn: vi.fn(),
}));

import { jobsKeys } from "@/domains/jobs/jobs-keys";
import { jobDetailQuery } from "@/domains/jobs/queries";
import { placeholderFor } from "@/testing/query-placeholder";
import { buildJobRecord } from "@/testing/records";
import { testId } from "@watchdog/test-kit";

describe("jobs queries", () => {
  it("keeps a Job detail's previous data only for the same Job", () => {
    const job = buildJobRecord({ id: testId(1) });
    const query = jobDetailQuery("case-1", "job-1");

    expect(placeholderFor(query, job, jobsKeys.detail("case-1", "job-1"))).toBe(
      job
    );
    expect(
      placeholderFor(query, job, jobsKeys.detail("case-1", "job-2"))
    ).toBeUndefined();
  });
});
