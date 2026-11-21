import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import { jobsKeys } from "@/domains/jobs/jobs-keys";
import { jobDetailQuery, jobsRecentQuery } from "@/domains/jobs/queries";
import { procedureDouble } from "@/testing/orpc-client";
import { placeholderFor } from "@/testing/query-placeholder";
import { buildJobListRecord, buildJobRecord } from "@/testing/records";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const listForCase = procedureDouble("jobs.listForCase");

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

  it("reads the Case's newest 50 Jobs, one page, as rows", async () => {
    const caseId = testCaseId(1);
    const row = buildJobListRecord({ id: testId(2) });
    listForCase.mockResolvedValue({
      items: [row],
      nextCursor: "next",
      total: { count: 70, isCapped: false },
    });

    await expect(
      new QueryClient().query(jobsRecentQuery(caseId))
    ).resolves.toEqual([row]);
    expect(listForCase).toHaveBeenCalledWith({ caseId, limit: 50 });
  });

  it("keys each read under the Case's jobs key", () => {
    const caseId = testCaseId(1);
    const client = new QueryClient();
    client.setQueryData(jobsKeys.detail(caseId, testId(2)), {});
    client.setQueryData(jobsKeys.detail(testCaseId(2), testId(2)), {});
    expect(
      client.getQueryCache().findAll({ queryKey: jobsKeys.all(caseId) })
    ).toHaveLength(1);
  });
});
