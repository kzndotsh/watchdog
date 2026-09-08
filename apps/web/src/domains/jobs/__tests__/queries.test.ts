import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  GC_REALTIME,
  GC_STABLE,
  STALE_REALTIME,
  STALE_STABLE,
} from "@/shared/lib/query-stale";

vi.mock("@/domains/jobs/jobs.functions", () => ({
  getJobFn: vi.fn(),
  listCapabilitiesFn: vi.fn(),
  listJobsFn: vi.fn(),
  listPlaybooksFn: vi.fn(),
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterJobMutation: vi.fn(),
}));

import {
  capabilitiesListQuery,
  jobDetailQuery,
  jobsKeys,
  jobsListQuery,
  playbooksListQuery,
  refreshJobsAfterMutation,
} from "@/domains/jobs/queries";
import { invalidateAfterJobMutation } from "@/shared/lib/query-invalidation";

describe("jobs queries", () => {
  it("builds case-scoped job and artifact keys", () => {
    expect(jobsKeys.all("case-1")).toEqual(["jobs", "case-1"]);
    expect(jobsKeys.detail("case-1", "job-1")).toEqual([
      "jobs",
      "case-1",
      "detail",
      "job-1",
    ]);
    expect(
      jobsKeys.jobArtifact("case-1", "job-1", "abc", "text/plain")
    ).toEqual(["artifact", "job", "case-1", "job-1", "abc", "text/plain"]);
    expect(jobsKeys.evidenceArtifact("case-1", "ev-1", "text/plain")).toEqual([
      "artifact",
      "evidence",
      "case-1",
      "ev-1",
      "text/plain",
    ]);
  });

  it("uses realtime tiers for job lists and stable tiers for catalogs", () => {
    expect(jobsListQuery("case-1")).toMatchObject({
      queryKey: jobsKeys.all("case-1"),
      staleTime: STALE_REALTIME,
      gcTime: GC_REALTIME,
    });
    expect(jobDetailQuery("case-1", "job-1")).toMatchObject({
      queryKey: jobsKeys.detail("case-1", "job-1"),
      staleTime: STALE_REALTIME,
      gcTime: GC_REALTIME,
    });
    expect(capabilitiesListQuery()).toMatchObject({
      queryKey: ["capabilities"],
      staleTime: STALE_STABLE,
      gcTime: GC_STABLE,
    });
    expect(playbooksListQuery()).toMatchObject({
      queryKey: ["playbooks"],
      staleTime: STALE_STABLE,
      gcTime: GC_STABLE,
    });
    expect(capabilitiesListQuery().placeholderData).toBeTypeOf("function");
    expect(playbooksListQuery().placeholderData).toBeTypeOf("function");
  });

  it("keeps placeholder data only for the same case key", () => {
    const caseOne = jobsListQuery("case-1");
    const caseTwo = jobsListQuery("case-2");
    const placeholderOne = caseOne.placeholderData;
    const placeholderTwo = caseTwo.placeholderData;
    expect(typeof placeholderOne).toBe("function");
    expect(typeof placeholderTwo).toBe("function");
    if (
      typeof placeholderOne !== "function" ||
      typeof placeholderTwo !== "function"
    ) {
      return;
    }

    const previousData = [{ id: "job-1" }] as never;
    const caseOneQuery = { queryKey: jobsKeys.all("case-1") };
    const caseTwoQuery = { queryKey: jobsKeys.all("case-2") };

    expect(placeholderOne(previousData, caseOneQuery as never)).toEqual(
      previousData
    );
    expect(placeholderOne(previousData, caseTwoQuery as never)).toBeUndefined();
    expect(placeholderTwo(previousData, caseTwoQuery as never)).toEqual(
      previousData
    );
    expect(placeholderTwo(previousData, caseOneQuery as never)).toBeUndefined();
  });

  it("keeps placeholder data only for the same job detail key", () => {
    const jobOne = jobDetailQuery("case-1", "job-1");
    const jobTwo = jobDetailQuery("case-1", "job-2");
    const placeholderOne = jobOne.placeholderData;
    const placeholderTwo = jobTwo.placeholderData;
    expect(typeof placeholderOne).toBe("function");
    expect(typeof placeholderTwo).toBe("function");
    if (
      typeof placeholderOne !== "function" ||
      typeof placeholderTwo !== "function"
    ) {
      return;
    }

    const previousData = { id: "job-1" } as never;
    const jobOneQuery = { queryKey: jobsKeys.detail("case-1", "job-1") };
    const jobTwoQuery = { queryKey: jobsKeys.detail("case-1", "job-2") };

    expect(placeholderOne(previousData, jobOneQuery as never)).toEqual(
      previousData
    );
    expect(placeholderOne(previousData, jobTwoQuery as never)).toBeUndefined();
    expect(placeholderTwo(previousData, jobTwoQuery as never)).toEqual(
      previousData
    );
    expect(placeholderTwo(previousData, jobOneQuery as never)).toBeUndefined();
  });

  it("delegates refreshJobsAfterMutation to the shared invalidation contract", async () => {
    const client = {} as QueryClient;
    await refreshJobsAfterMutation(client, "case-1");
    expect(invalidateAfterJobMutation).toHaveBeenCalledWith(client, "case-1");
  });
});
