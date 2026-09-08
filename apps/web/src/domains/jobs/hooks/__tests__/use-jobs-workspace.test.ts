import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  JobListRecord,
  JobRecord,
  CapListItem,
} from "@/domains/jobs/types";
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
  const row: JobListRecord = {
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
  if (overrides.createdAt !== undefined && overrides.updatedAt === undefined) {
    row.updatedAt = overrides.createdAt;
  }
  return row;
}

function detailJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    ...listJob(),
    logs: ["started"],
    ...overrides,
  };
}

useMutationMock.mockImplementation((options) => {
  const idx = (useMutationMock.mock.calls.length - 1) % intakeMutations.length;
  const base = intakeMutations[idx] ?? startMutation;
  return {
    ...base,
    mutateAsync: vi.fn(async (...args: unknown[]) => {
      const result = await base.mutateAsync(...args);
      if (options?.onSuccess) {
        await options.onSuccess(result, args[0], undefined);
      }
      return result;
    }),
  };
});

function idleQuery(data: unknown) {
  return {
    data,
    isPending: false,
    isFetched: true,
    isLoading: false,
    isError: false,
  };
}

function renderWorkspace({
  jobId,
  jobs = [listJob()],
  queue = jobs,
  detailQuery,
}: {
  jobId?: string | null;
  jobs?: JobListRecord[];
  queue?: JobListRecord[];
  detailQuery?: {
    data?: JobRecord;
    isFetched: boolean;
    isLoading: boolean;
    isFetching?: boolean;
    isError: boolean;
    error?: Error;
  };
} = {}) {
  useQueryMock.mockImplementation(
    (options: { queryKey?: unknown[]; enabled?: boolean }) => {
      if (options.enabled === false) {
        return {
          data: undefined,
          isPending: false,
          isFetched: false,
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        };
      }
      const key = options.queryKey ?? [];
      if (key[2] === "detail") {
        if (detailQuery) {
          return {
            ...detailQuery,
            data:
              detailQuery.data ??
              (() => {
                if (detailQuery.isLoading || detailQuery.isError) {
                  return undefined;
                }
                return detailJob({ id: String(key[3]) });
              })(),
            isPending: detailQuery.isLoading,
            refetch: vi.fn(),
          };
        }
        return {
          ...idleQuery(detailJob({ id: String(key[3]) })),
          refetch: vi.fn(),
        };
      }
      return idleQuery(undefined);
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
    expect(result.current.detailPending).toBe(false);
    expect(result.current.selectionOutOfSync).toBe(false);
  });

  it("reports detailPending while the job detail query is loading", () => {
    const { result } = renderWorkspace({
      jobId: JOB_ID,
      detailQuery: {
        data: undefined,
        isFetched: false,
        isLoading: true,
        isError: false,
      },
    });

    expect(result.current.detailPending).toBe(true);
    expect(result.current.detailJob).toBeNull();
    expect(result.current.detailLoadError).toBeNull();
  });

  it("surfaces detailLoadError when the job detail query fails", () => {
    const { result } = renderWorkspace({
      jobId: JOB_ID,
      detailQuery: {
        data: undefined,
        isFetched: true,
        isLoading: false,
        isError: true,
        error: new Error("network down"),
      },
    });

    expect(result.current.detailPending).toBe(false);
    expect(result.current.detailJob).toBeNull();
    expect(result.current.detailLoadError).toBe("network down");
  });

  it("hides detailLoadError while refetching after a failure", () => {
    const { result } = renderWorkspace({
      jobId: JOB_ID,
      detailQuery: {
        data: undefined,
        isFetched: true,
        isLoading: false,
        isFetching: true,
        isError: true,
        error: new Error("network down"),
      },
    });

    expect(result.current.detailLoadError).toBeNull();
  });

  it("does not report detailPending when the detail query is disabled", () => {
    const { result } = renderWorkspace({
      jobs: [],
      queue: [],
    });

    expect(result.current.selectedId).toBeNull();
    expect(result.current.detailPending).toBe(false);
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
    const { result, onJobIdChange } = renderWorkspace({ jobId: JOB_ID });

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
    expect(onJobIdChange).toHaveBeenCalledWith(JOB_ID);
  });

  it("selects playbookRunId after starting a playbook", async () => {
    const playbookRunId = testId(50);
    const stepJobId = testId(51);
    const { result, onJobIdChange } = renderWorkspace({ jobId: null });
    startPlaybookMutation.mutateAsync.mockResolvedValue({
      playbookId: "host-footprint-lite",
      playbookRunId,
      jobs: [detailJob({ id: stepJobId, playbookRunId })],
    });

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
