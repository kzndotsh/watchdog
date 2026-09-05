import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JobListRecord, JobRecord } from "@/domains/jobs/jobs.functions";
import type { CapListItem } from "@/domains/jobs/types";
import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/jobs/jobs.functions", () => ({
  startJobFn: vi.fn(),
  startPlaybookFn: vi.fn(),
  cancelJobFn: vi.fn(),
  cancelPlaybookFn: vi.fn(),
}));

vi.mock("@/domains/jobs/queries", () => ({
  refreshJobsAfterMutation: vi.fn().mockResolvedValue(undefined),
  jobDetailQuery: (caseId: string, jobId: string) => ({
    queryKey: ["jobs", caseId, "detail", jobId],
  }),
  jobsKeys: {
    all: (caseId: string) => ["jobs", caseId],
    detail: (caseId: string, jobId: string) => [
      "jobs",
      caseId,
      "detail",
      jobId,
    ],
  },
}));

vi.mock("@/shared/hooks/use-live-events", () => ({
  useLiveEvents: vi.fn(),
}));

const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());
const startMutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
}));
const startPlaybookMutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
}));
const cancelMutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
}));
const cancelPlaybookMutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
}));

const intakeMutations = [
  startMutation,
  startPlaybookMutation,
  cancelMutation,
  cancelPlaybookMutation,
] as const;

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
    useMutation: (...args: unknown[]) => useMutationMock(...args),
  };
});

import { useJobsWorkspace } from "@/domains/jobs/hooks/use-jobs-workspace";

const CASE_ID = testId(10);
const JOB_ID = testId(11);

const CAP: CapListItem = {
  id: "network.dns.lookup",
  version: "1",
  title: "DNS lookup",
  egress: "none",
  input: {},
  inputForm: { type: "object", properties: { host: { type: "string" } } },
};

function listJob(overrides: Partial<JobListRecord> = {}): JobListRecord {
  return {
    id: JOB_ID,
    caseId: CASE_ID,
    capabilityId: "network.dns.lookup",
    status: "queued",
    input: { host: "mailhost.test" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    error: null,
    interpretError: null,
    proposalId: null,
    resultSummary: null,
    fromCache: false,
    suppressedCount: 0,
    playbookRunId: null,
    playbookId: null,
    playbookRunStatus: null,
    playbookStep: null,
    evidenceIds: [],
    output: [],
    actorId: "test-actor",
    actorLabel: "test-actor",
    playbookFanIndex: 0,
    ...overrides,
  };
}

function detailJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    ...listJob(),
    logs: ["started"],
    ...overrides,
  };
}

useMutationMock.mockImplementation(() => {
  const idx = (useMutationMock.mock.calls.length - 1) % intakeMutations.length;
  return intakeMutations[idx] ?? startMutation;
});

function renderWorkspace({
  jobId,
  jobs = [listJob()],
  queue = jobs,
}: {
  jobId?: string;
  jobs?: JobListRecord[];
  queue?: JobListRecord[];
} = {}) {
  useQueryMock.mockImplementation(
    (options: { queryKey?: unknown[]; enabled?: boolean }) => {
      if (options.enabled === false) {
        return { data: undefined, isPending: false };
      }
      const key = options.queryKey ?? [];
      if (key[2] === "detail") {
        return { data: detailJob({ id: String(key[3]) }) };
      }
      return { data: undefined, isPending: false };
    }
  );

  startMutation.mutateAsync.mockResolvedValue(detailJob());
  startPlaybookMutation.mutateAsync.mockResolvedValue({ jobs: [detailJob()] });

  const onJobIdChange = vi.fn();
  const client = new QueryClient();

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

  return { ...view, onJobIdChange };
}

describe("useJobsWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T01:05:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves queue selection and loads job detail", () => {
    const { result } = renderWorkspace({ jobId: JOB_ID });

    expect(result.current.selectedId).toBe(JOB_ID);
    expect(result.current.detailJob?.id).toBe(JOB_ID);
    expect(result.current.selectionOutOfSync).toBe(false);
  });

  it("flags selection drift against the URL job id", () => {
    const { result } = renderWorkspace({
      jobId: testId(99),
      queue: [listJob()],
    });

    expect(result.current.selectedId).toBe(JOB_ID);
    expect(result.current.selectionOutOfSync).toBe(true);
  });

  it("starts a cap run through the start mutation", async () => {
    const { result } = renderWorkspace({ jobId: JOB_ID });

    await act(async () => {
      await result.current.handleRunCap({
        capabilityId: CAP.id,
        runInput: "mailhost.test",
        entityId: "",
      });
    });

    expect(startMutation.mutateAsync).toHaveBeenCalledWith({
      capabilityId: CAP.id,
      runInput: "mailhost.test",
      entityId: "",
    });
  });

  it("cancels the selected job", () => {
    const { result } = renderWorkspace({ jobId: JOB_ID });

    act(() => {
      result.current.handleCancel();
    });

    expect(cancelMutation.mutate).toHaveBeenCalledTimes(1);
  });

  it("surfaces stuck queued jobs older than one minute", () => {
    const fresh = listJob({
      createdAt: "2026-01-01T01:04:30.000Z",
    });
    const stuck = listJob({
      id: testId(12),
      createdAt: "2026-01-01T00:00:00.000Z",
      status: "queued",
    });
    const { result } = renderWorkspace({
      jobId: JOB_ID,
      jobs: [fresh, stuck],
      queue: [fresh, stuck],
    });

    expect(result.current.stuckJobs.map((job) => job.id)).toEqual([testId(12)]);
  });
});
