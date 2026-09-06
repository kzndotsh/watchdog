import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_COLLECT_FILTERS } from "@/domains/collect/types";
import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord, JobRecord } from "@/domains/jobs/jobs.functions";
import { testId } from "@watchdog/test-kit";

const cancelJobFn = vi.hoisted(() => vi.fn());
const getJobFn = vi.hoisted(() => vi.fn());
const useCollectQueueDataMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/domains/jobs/jobs.functions", () => ({
  startJobFn: vi.fn(),
  startPlaybookFn: vi.fn(),
  cancelJobFn,
  cancelPlaybookFn: vi.fn(),
  getJobFn,
  listJobsFn: vi.fn(),
  listCapabilitiesFn: vi.fn(),
  listPlaybooksFn: vi.fn(),
  getArtifactContentFn: vi.fn(),
}));

vi.mock("@/domains/jobs/queries", () => ({
  refreshJobsAfterMutation: vi.fn().mockResolvedValue(undefined),
  jobDetailQuery: (caseId: string, jobId: string) => ({
    queryKey: ["jobs", caseId, "detail", jobId],
    queryFn: async () => getJobFn({ data: { caseId, jobId } }),
  }),
  jobsListQuery: (caseId: string) => ({
    queryKey: ["jobs", caseId],
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

vi.mock("@/domains/intake/queries", () => ({
  evidenceListQuery: (caseId: string, opts?: { hiddenOnly?: boolean }) => ({
    queryKey: ["evidence", caseId, "list", opts?.hiddenOnly === true],
  }),
}));

vi.mock("@/shared/hooks/use-live-events", () => ({
  useLiveEvents: vi.fn(),
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  bindCasesChangedInvalidation: vi.fn(() => () => undefined),
  invalidateAfterEvidenceMutation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/domains/collect/lib/prefetch-collect", () => ({
  prefetchCollectEvidenceBlobWhenSelected: vi.fn(),
}));

vi.mock("@/domains/intake/hooks/use-intake-actions", () => ({
  useIntakeActions: () => ({
    actionError: null,
    entityId: "",
    setEntityId: vi.fn(),
    busy: false,
    uploading: false,
    uploadStatus: null,
    dumpingPaste: false,
    dumpingUrl: false,
    onFiles: vi.fn(),
    onPaste: vi.fn(),
    onUrl: vi.fn(),
    evidenceActions: {
      busy: false,
      processing: false,
      aiProcessing: false,
      enriching: false,
      attaching: false,
      onProcess: vi.fn(),
      onAiProcess: vi.fn(),
      onEnrich: vi.fn(),
      onHide: vi.fn(),
      onRestore: vi.fn(),
      onAttachEntity: vi.fn(),
    },
  }),
}));

vi.mock("@/domains/collect/hooks/use-collect-queue-data", () => ({
  useCollectQueueData: (...args: unknown[]) => useCollectQueueDataMock(...args),
}));

import { useCollectWorkspace } from "@/domains/collect/hooks/use-collect-workspace";

const CASE_ID = testId(10);
const UNRELATED_ID = testId(11);
const STEP1_ID = testId(12);
const STEP2_ID = testId(13);
const PLAYBOOK_RUN_ID = testId(14);
const PLAYBOOK_ID = testId(15);
const EVIDENCE_ID = testId(40);

function listJob(overrides: Partial<JobListRecord> = {}): JobListRecord {
  return {
    id: testId(11),
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
    logs: [],
    ...overrides,
  };
}

function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: EVIDENCE_ID,
    caseId: CASE_ID,
    entityId: null,
    kind: "attestation",
    label: "note",
    notes: null,
    mime: "text/plain",
    uri: null,
    sha256: null,
    text: "dump body",
    sourceUrl: null,
    actorId: "test-actor",
    actorLabel: "test-actor",
    capturedAt: "2026-01-01T00:00:00.000Z",
    processedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

const unrelatedJob = listJob({
  id: UNRELATED_ID,
  createdAt: "2026-01-01T00:03:00.000Z",
  input: { host: "unrelated.test" },
});

const step1 = listJob({
  id: STEP1_ID,
  playbookRunId: PLAYBOOK_RUN_ID,
  playbookId: PLAYBOOK_ID,
  playbookRunStatus: "running",
  playbookStep: 1,
  status: "running",
  createdAt: "2026-01-01T00:02:00.000Z",
  input: { host: "step1.test" },
});

const step2 = listJob({
  id: STEP2_ID,
  playbookRunId: PLAYBOOK_RUN_ID,
  playbookId: PLAYBOOK_ID,
  playbookRunStatus: "running",
  playbookStep: 2,
  status: "queued",
  createdAt: "2026-01-01T00:01:00.000Z",
  input: { host: "step2.test" },
});

function mockQueue(opts?: {
  jobs?: JobListRecord[];
  evidence?: EvidenceRecord[];
}) {
  const jobs = opts?.jobs ?? [unrelatedJob, step1, step2];
  const evidenceRows = opts?.evidence ?? [];
  useCollectQueueDataMock.mockReturnValue({
    filters: EMPTY_COLLECT_FILTERS,
    setFilters: vi.fn(),
    evidence: evidenceRows,
    evidenceRows,
    jobs,
    entities: [],
    urlDumps: [],
    configuredCredentials: new Set<string>(),
    recipeStepCountByPlaybookId: new Map([[PLAYBOOK_ID, 2]]),
    queueCorePending: false,
    queuePending: false,
    queuePlaceholder: false,
    queueLoadError: null,
    jobsListFetching: false,
    evidenceError: false,
    hiddenEvidenceError: false,
    jobsError: false,
  });
}

function renderCollect(urlId?: string) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const onIdChange = vi.fn();
  const view = renderHook(
    () =>
      useCollectWorkspace({
        caseId: CASE_ID,
        caps: [],
        playbooks: [],
        urlId,
        onIdChange,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    }
  );
  return { ...view, onIdChange };
}

describe("useCollectWorkspace job-id adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getJobFn.mockImplementation(async ({ data }: { data: { jobId: string } }) =>
      detailJob({ id: data.jobId })
    );
    cancelJobFn.mockResolvedValue(detailJob({ id: STEP1_ID }));
    mockQueue();
  });

  it("cancels the current playbook step, not jobs[0] or the run id", async () => {
    const { result } = renderCollect(PLAYBOOK_RUN_ID);

    expect(result.current.selected?.id).toBe(PLAYBOOK_RUN_ID);
    expect(result.current.jobsWs.selectedId).toBe(STEP1_ID);
    expect(result.current.jobsWs.selectedId).not.toBe(UNRELATED_ID);
    expect(result.current.jobsWs.selectedId).not.toBe(PLAYBOOK_RUN_ID);

    act(() => {
      result.current.jobsWs.handleCancel();
    });

    await waitFor(() => {
      expect(cancelJobFn).toHaveBeenCalledWith({
        data: { caseId: CASE_ID, jobId: STEP1_ID },
      });
    });
    expect(cancelJobFn).not.toHaveBeenCalledWith({
      data: { caseId: CASE_ID, jobId: UNRELATED_ID },
    });
    expect(cancelJobFn).not.toHaveBeenCalledWith({
      data: { caseId: CASE_ID, jobId: PLAYBOOK_RUN_ID },
    });
  });

  it("does not treat an evidence row id as a job id", () => {
    const dump = evidence();
    mockQueue({
      jobs: [unrelatedJob, step1, step2],
      evidence: [dump],
    });
    const { result } = renderCollect(EVIDENCE_ID);

    expect(result.current.selected?.id).toBe(EVIDENCE_ID);
    expect(result.current.selected?.evidence?.id).toBe(EVIDENCE_ID);
    expect(result.current.jobsWs.selectedId).not.toBe(EVIDENCE_ID);
    expect(result.current.jobsWs.selectedId).not.toBe(PLAYBOOK_RUN_ID);
  });
});
