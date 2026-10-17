import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { jobDetailQuery, jobsKeys } from "@/domains/jobs/queries";
import type { CapListItem } from "@/domains/jobs/types";
import { buildJobListRecord, buildJobRecord } from "@/testing/records";
import type { JobListRecord, JobRecord } from "@watchdog/core/jobs";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

// Only the network boundary is faked. The hook runs against a real QueryClient and the
// real `jobs/queries` module, so a changed query key or a cache write under the wrong key
// fails here (docs/contributing/testing/standards.md Mock policy).
vi.mock("@/domains/jobs/jobs.functions", () => ({
  getJobFn: vi.fn(),
  startJobFn: vi.fn(),
  startPlaybookFn: vi.fn(),
  cancelJobFn: vi.fn(),
  cancelPlaybookFn: vi.fn(),
  retryJobFn: vi.fn(),
}));

import { useJobsWorkspace } from "@/domains/jobs/hooks/use-jobs-workspace";
import {
  cancelJobFn,
  getJobFn,
  retryJobFn,
  startJobFn,
  startPlaybookFn,
} from "@/domains/jobs/jobs.functions";

const CASE_ID = testCaseId(10);
const JOB_ID = testId(11);

const CAP: CapListItem = {
  id: "network.dns.lookup",
  version: "1",
  title: "DNS lookup",
  egress: "none",
  input: {},
  inputForm: { type: "object", properties: { host: { type: "string" } } },
};

const listJob = (overrides: Partial<JobListRecord> = {}) =>
  buildJobListRecord({ id: JOB_ID, caseId: CASE_ID, ...overrides });

const detailJob = (overrides: Partial<JobRecord> = {}) =>
  buildJobRecord({
    id: JOB_ID,
    caseId: CASE_ID,
    logs: ["started"],
    ...overrides,
  });

type RenderOptions = {
  jobId?: string | null;
  jobs?: JobListRecord[];
  queue?: JobListRecord[];
};

function renderWorkspace({
  jobId,
  jobs = [listJob()],
  queue = jobs,
}: RenderOptions = {}) {
  const onJobIdChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = renderHook(
    () =>
      useJobsWorkspace(CASE_ID, {
        jobId,
        onJobIdChange,
        caps: [CAP],
        jobs,
        queue,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    }
  );
  return { ...view, client, onJobIdChange };
}

describe("useJobsWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Only Date: waitFor and the query client keep real timers.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T01:05:00.000Z"));
    vi.mocked(getJobFn).mockImplementation(async ({ data }) =>
      detailJob({ id: data.jobId })
    );
    vi.mocked(startJobFn).mockResolvedValue(detailJob());
    vi.mocked(startPlaybookFn).mockResolvedValue({
      playbookId: "host-footprint-lite",
      playbookRunId: testId(50),
      jobs: [detailJob()],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves queue selection and loads job detail", async () => {
    const { result } = renderWorkspace({ jobId: JOB_ID });

    await waitFor(() => {
      expect(result.current.detailJob?.id).toBe(JOB_ID);
    });
    expect(result.current.selectedId).toBe(JOB_ID);
    expect(result.current.detailPending).toBe(false);
    expect(result.current.selectionOutOfSync).toBe(false);
    expect(getJobFn).toHaveBeenCalledWith({
      data: { caseId: CASE_ID, jobId: JOB_ID },
    });
  });

  it("reports detailPending while the job detail query is loading", () => {
    vi.mocked(getJobFn).mockReturnValue(new Promise(() => {}));
    const { result } = renderWorkspace({ jobId: JOB_ID });

    expect(result.current.detailPending).toBe(true);
    expect(result.current.detailJob).toBeNull();
    expect(result.current.detailLoadError).toBeNull();
  });

  it("surfaces detailLoadError when the job detail query fails", async () => {
    vi.mocked(getJobFn).mockRejectedValue(new Error("network down"));
    const { result } = renderWorkspace({ jobId: JOB_ID });

    await waitFor(() => {
      expect(result.current.detailLoadError).toBe("network down");
    });
    expect(result.current.detailPending).toBe(false);
    expect(result.current.detailJob).toBeNull();
  });

  it("hides detailLoadError while refetching after a failure", async () => {
    vi.mocked(getJobFn).mockRejectedValue(new Error("network down"));
    const { result } = renderWorkspace({ jobId: JOB_ID });
    await waitFor(() => {
      expect(result.current.detailLoadError).toBe("network down");
    });

    vi.mocked(getJobFn).mockReturnValue(new Promise(() => {}));
    act(() => {
      result.current.handleRetryDetail();
    });

    await waitFor(() => {
      expect(result.current.detailLoadError).toBeNull();
    });
  });

  it("does not load detail when nothing is selected", () => {
    const { result } = renderWorkspace({ jobs: [], queue: [] });

    expect(result.current.selectedId).toBeNull();
    expect(result.current.detailPending).toBe(false);
    expect(getJobFn).not.toHaveBeenCalled();
  });

  it("does not fall back to the first job when jobId is null", () => {
    const unrelated = listJob({ id: testId(12) });
    const { result } = renderWorkspace({
      jobId: null,
      jobs: [unrelated],
      queue: [unrelated],
    });

    expect(result.current.selectedId).toBeNull();
    expect(result.current.detailJob).toBeNull();
    expect(getJobFn).not.toHaveBeenCalled();
  });

  it("flags selection drift against the URL job id", () => {
    const { result } = renderWorkspace({
      jobId: testId(99),
      queue: [listJob()],
    });

    expect(result.current.selectedId).toBe(JOB_ID);
    expect(result.current.selectionOutOfSync).toBe(true);
  });

  it("starts a cap run and seeds the list and detail caches under the query keys", async () => {
    // No selection, so the detail query is disabled: the only way data reaches the
    // detail cache is the hook's own write after the start.
    const { result, client, onJobIdChange } = renderWorkspace({ jobId: null });

    await act(async () => {
      await result.current.handleRunCap({
        capabilityId: CAP.id,
        runInput: "mailhost.test",
        entityId: "",
      });
    });

    expect(startJobFn).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId: CASE_ID,
        capabilityId: CAP.id,
        input: { host: "mailhost.test" },
      }),
    });
    expect(onJobIdChange).toHaveBeenCalledWith(JOB_ID);
    // Read through the queries the screens use, not through a key typed here.
    expect(
      client.getQueryData(jobDetailQuery(CASE_ID, JOB_ID).queryKey)
    ).toEqual(detailJob());
    expect(client.getQueryData(jobsKeys.all(CASE_ID))).toEqual([
      expect.objectContaining({ id: JOB_ID }),
    ]);
  });

  it("selects playbookRunId after starting a playbook", async () => {
    const playbookRunId = testId(50);
    const stepJobId = testId(51);
    vi.mocked(startPlaybookFn).mockResolvedValue({
      playbookId: "host-footprint-lite",
      playbookRunId,
      jobs: [detailJob({ id: stepJobId, playbookRunId })],
    });
    const { result, onJobIdChange } = renderWorkspace({ jobId: null });

    await act(async () => {
      await result.current.handleRunPlaybook({
        playbookId: "host-footprint-lite",
        host: "mailhost.test",
        url: "",
        evidenceId: "",
        entityId: "",
        ip: "",
        email: "",
        hash: "",
        handle: "",
      });
    });

    expect(onJobIdChange).toHaveBeenCalledWith(playbookRunId);
    expect(onJobIdChange).not.toHaveBeenCalledWith(stepJobId);
  });

  it("retries the selected job, selects the new attempt and seeds the caches", async () => {
    const retriedId = testId(12);
    vi.mocked(retryJobFn).mockResolvedValue(
      detailJob({ id: retriedId, retryOfJobId: JOB_ID })
    );
    const failed = listJob({ status: "failed" });
    const { result, client, onJobIdChange } = renderWorkspace({
      jobId: JOB_ID,
      jobs: [failed],
    });

    await act(async () => {
      result.current.handleRetry();
    });

    await waitFor(() => {
      expect(onJobIdChange).toHaveBeenCalledWith(retriedId);
    });
    expect(retryJobFn).toHaveBeenCalledWith({
      data: { caseId: CASE_ID, jobId: JOB_ID },
    });
    expect(
      client.getQueryData(jobDetailQuery(CASE_ID, retriedId).queryKey)
    ).toEqual(expect.objectContaining({ retryOfJobId: JOB_ID }));
    expect(client.getQueryData(jobsKeys.all(CASE_ID))).toEqual([
      expect.objectContaining({ id: retriedId, retryOfJobId: JOB_ID }),
    ]);
  });

  it("reports a retry that the server refused and selects nothing", async () => {
    vi.mocked(retryJobFn).mockRejectedValue(
      new Error("Only finished Jobs can be retried")
    );
    const { result, onJobIdChange } = renderWorkspace({ jobId: JOB_ID });

    await act(async () => {
      result.current.handleRetry();
    });

    await waitFor(() => {
      expect(result.current.error).toBe("Only finished Jobs can be retried");
    });
    expect(onJobIdChange).not.toHaveBeenCalled();
  });

  it("exposes the attempt chain of the selected job", () => {
    const first = listJob({
      id: testId(31),
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const second = listJob({
      id: JOB_ID,
      retryOfJobId: first.id,
      createdAt: "2026-01-01T00:01:00.000Z",
    });
    const { result } = renderWorkspace({
      jobId: JOB_ID,
      jobs: [second, first],
    });

    expect(result.current.attempts.map((job) => job.id)).toEqual([
      first.id,
      JOB_ID,
    ]);
  });

  it("cancels the selected job", async () => {
    vi.mocked(cancelJobFn).mockResolvedValue(
      detailJob({ status: "cancelled" })
    );
    const { result } = renderWorkspace({ jobId: JOB_ID });

    await act(async () => {
      result.current.handleCancel();
    });

    await waitFor(() => {
      expect(cancelJobFn).toHaveBeenCalledWith({
        data: { caseId: CASE_ID, jobId: JOB_ID },
      });
    });
  });

  it("surfaces stuck queued jobs older than one minute", () => {
    const fresh = listJob({
      createdAt: "2026-01-01T01:04:30.000Z",
      updatedAt: "2026-01-01T01:04:30.000Z",
    });
    const stuck = listJob({
      id: testId(12),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      status: "queued",
    });
    const { result } = renderWorkspace({
      jobId: JOB_ID,
      jobs: [fresh, stuck],
      queue: [fresh, stuck],
    });

    expect(result.current.stuckJobs.map((job) => job.id)).toEqual([testId(12)]);
  });

  it("does not flag recently re-queued jobs with stale createdAt", () => {
    const requeued = listJob({
      id: testId(12),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T01:04:30.000Z",
      status: "queued",
    });
    const { result } = renderWorkspace({
      jobId: JOB_ID,
      jobs: [requeued],
      queue: [requeued],
    });

    expect(result.current.stuckJobs).toEqual([]);
  });
});
