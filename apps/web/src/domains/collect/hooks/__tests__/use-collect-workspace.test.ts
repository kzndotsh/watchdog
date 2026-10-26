import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CollectRunTarget } from "@/domains/collect/lib/collect-run-target";
import type { CollectSearch } from "@/domains/collect/lib/collect-search";
import type { CapListItem } from "@/domains/jobs/types";
import {
  buildCapListItem,
  buildEvidenceRecord,
  buildJobListRecord,
  buildJobRecord,
} from "@/testing/records";
import type { CollectQueueItem } from "@watchdog/core/jobs";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const cancelJobFn = vi.hoisted(() => vi.fn());
const getJobFn = vi.hoisted(() => vi.fn());
const listCollectPageFn = vi.hoisted(() => vi.fn());
const getCollectItemFn = vi.hoisted(() => vi.fn());
const toastInfo = vi.hoisted(() => vi.fn());

vi.mock("@/domains/jobs/jobs.functions", () => ({
  startJobFn: vi.fn(),
  startPlaybookFn: vi.fn(),
  cancelJobFn,
  cancelPlaybookFn: vi.fn(),
  getJobFn,
  listCapabilitiesFn: vi.fn(),
  listPlaybooksFn: vi.fn(),
}));

vi.mock("@/domains/collect/collect.functions", () => ({
  listCollectPageFn,
  getCollectItemFn,
}));

vi.mock("@/shared/ui/toast", () => ({ toast: { info: toastInfo } }));

// The Run form's side reads: not what these tests are about.
vi.mock("@/domains/entities/queries", () => ({
  entitiesListQuery: (caseId: string) => ({
    queryKey: ["entities", caseId, "test-list"],
    queryFn: async () => [],
  }),
}));
vi.mock("@/domains/intake/queries", () => ({
  urlDumpsQuery: (caseId: string) => ({
    queryKey: ["evidence", caseId, "url-dumps"],
    queryFn: async () => [],
  }),
}));
vi.mock("@/domains/settings/queries", () => ({
  credentialsKeys: { all: ["credentials"] },
  credentialsListQuery: () => ({
    queryKey: ["credentials"],
    queryFn: async () => [],
  }),
}));

vi.mock("@/domains/intake/hooks/use-intake-actions", () => ({
  useIntakeActions: () => ({
    actionError: null,
    busy: false,
    evidenceActions: {},
  }),
}));

import { useCollectWorkspace } from "@/domains/collect/hooks/use-collect-workspace";

const CASE_ID = testCaseId(10);
const LONE_ID = testId(11);
const STEP1_ID = testId(12);
const STEP2_ID = testId(13);
const RUN_ID = testId(14);
const PLAYBOOK_ID = testId(15);
const EVIDENCE_ID = testId(40);
const FAR_ID = testId(60);

const lone = buildJobListRecord({
  id: LONE_ID,
  input: { host: "retry-me.test" },
  createdAt: "2026-01-01T00:03:00.000Z",
});
const step1 = buildJobListRecord({
  id: STEP1_ID,
  playbookRunId: RUN_ID,
  playbookId: PLAYBOOK_ID,
  playbookRunStatus: "running",
  playbookStep: 1,
  status: "running",
});
const step2 = buildJobListRecord({
  id: STEP2_ID,
  playbookRunId: RUN_ID,
  playbookId: PLAYBOOK_ID,
  playbookRunStatus: "running",
  playbookStep: 2,
  status: "queued",
});

function item(overrides: Partial<CollectQueueItem>): CollectQueueItem {
  return {
    id: LONE_ID,
    kind: "job",
    state: "queued",
    sortAt: "2026-01-01T00:00:00.000Z",
    activityAt: "2026-01-01T00:00:00.000Z",
    entityId: null,
    capabilityIds: [],
    playbookRunId: null,
    evidence: null,
    jobs: [],
    titles: { evidence: {}, entity: {} },
    ...overrides,
  };
}

const loneRow = item({ id: LONE_ID, jobs: [lone] });
const runRow = item({
  id: RUN_ID,
  kind: "run",
  state: "running",
  playbookRunId: RUN_ID,
  jobs: [step1, step2],
});
const evidenceRow = item({
  id: EVIDENCE_ID,
  kind: "evidence",
  state: "unprocessed",
  evidence: buildEvidenceRecord({ id: EVIDENCE_ID }),
});
const farRow = item({ id: FAR_ID, jobs: [buildJobListRecord({ id: FAR_ID })] });

const dnsCap: CapListItem = buildCapListItem();

function serveRows(rows: CollectQueueItem[]) {
  listCollectPageFn.mockResolvedValue({
    items: rows,
    nextCursor: null,
    total: { count: rows.length, isCapped: false },
  });
}

function renderCollect(
  search: CollectSearch = {},
  caps: CapListItem[] = [],
  runTarget?: CollectRunTarget
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onSearchChange = vi.fn();
  const view = renderHook(
    () =>
      useCollectWorkspace({
        caseId: CASE_ID,
        caps,
        playbooks: [],
        search,
        onSearchChange,
        runTarget,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    }
  );
  return { ...view, onSearchChange };
}

describe("useCollectWorkspace selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getJobFn.mockImplementation(async ({ data }: { data: { jobId: string } }) =>
      buildJobRecord({ id: data.jobId })
    );
    cancelJobFn.mockResolvedValue(buildJobRecord({ id: STEP1_ID }));
    serveRows([loneRow, runRow, evidenceRow]);
  });

  it("selects the first row when the URL names none, and says the URL is out of sync", async () => {
    const { result } = renderCollect();

    await waitFor(() => {
      expect(result.current.selectedId).toBe(LONE_ID);
    });
    await waitFor(() => {
      expect(result.current.selectionOutOfSync).toBe(true);
    });
    expect(result.current.selected?.id).toBe(LONE_ID);
  });

  it("cancels the run's current step, not its first Job or the run id", async () => {
    const { result } = renderCollect({ id: RUN_ID });

    await waitFor(() => {
      expect(result.current.selected?.id).toBe(RUN_ID);
    });
    expect(result.current.jobsWs.selectedId).toBe(STEP1_ID);
    act(() => {
      result.current.jobsWs.handleCancel();
    });
    await waitFor(() => {
      expect(cancelJobFn).toHaveBeenCalledWith({
        data: { caseId: CASE_ID, jobId: STEP1_ID },
      });
    });
    expect(cancelJobFn).not.toHaveBeenCalledWith({
      data: { caseId: CASE_ID, jobId: RUN_ID },
    });
  });

  it("keeps the row and focuses the Job when the id names a Job of a loaded row", async () => {
    const { result } = renderCollect({ id: STEP2_ID });

    await waitFor(() => {
      expect(result.current.selected?.id).toBe(RUN_ID);
    });
    expect(result.current.focusJobId).toBe(STEP2_ID);
    expect(result.current.jobsWs.selectedId).toBe(STEP2_ID);
    expect(getCollectItemFn).not.toHaveBeenCalled();
    // The id names a Job the row holds: nothing to rewrite in the URL.
    expect(result.current.selectionOutOfSync).toBe(false);
  });

  it("does not treat an Evidence row id as a Job id", async () => {
    const { result } = renderCollect({ id: EVIDENCE_ID });

    await waitFor(() => {
      expect(result.current.selected?.id).toBe(EVIDENCE_ID);
    });
    expect(result.current.jobsWs.selectedId).toBeNull();
    expect(getJobFn).not.toHaveBeenCalled();
  });

  it("reads a row the loaded pages lack through collect.get, once the first page has landed", async () => {
    getCollectItemFn.mockResolvedValue({ item: farRow, focusJobId: null });
    const { result } = renderCollect({ id: FAR_ID });

    await waitFor(() => {
      expect(result.current.selected?.id).toBe(FAR_ID);
    });
    expect(getCollectItemFn).toHaveBeenCalledWith({
      data: { caseId: CASE_ID, id: FAR_ID },
    });
  });

  it("looks in the hidden view when the list is the hidden one", async () => {
    getCollectItemFn.mockResolvedValue({ item: farRow, focusJobId: null });
    renderCollect({ id: FAR_ID, hidden: true });

    await waitFor(() => {
      expect(getCollectItemFn).toHaveBeenCalledWith({
        data: { caseId: CASE_ID, id: FAR_ID, hidden: true },
      });
    });
  });

  it("clears ?id= with a notice when the Case holds nothing for it", async () => {
    getCollectItemFn.mockResolvedValue(null);
    const { onSearchChange } = renderCollect({ id: FAR_ID });

    await waitFor(() => {
      expect(onSearchChange).toHaveBeenCalledWith({ id: undefined });
    });
    expect(toastInfo).toHaveBeenCalled();
  });

  it("shows a failed by-id read as an error to retry, and keeps ?id=", async () => {
    getCollectItemFn.mockRejectedValue(new Error("network down"));
    const { result, onSearchChange } = renderCollect({ id: FAR_ID });

    await waitFor(() => {
      expect(result.current.selectionError).toBe("network down");
    });
    expect(onSearchChange).not.toHaveBeenCalled();
  });

  it("drops the selected id when the Hidden view is switched on, since a live row is not there", async () => {
    const { result, onSearchChange } = renderCollect({ id: LONE_ID });
    await waitFor(() => {
      expect(result.current.list.status).toBe("ready");
    });

    act(() => {
      result.current.list.controls.setFilter("hidden", true);
    });

    expect(onSearchChange).toHaveBeenCalledWith(
      expect.objectContaining({ hidden: true, id: undefined })
    );
  });

  it("keeps the selected id for a search or a sort", async () => {
    const { result, onSearchChange } = renderCollect({ id: LONE_ID });
    await waitFor(() => {
      expect(result.current.list.status).toBe("ready");
    });

    act(() => {
      result.current.list.controls.setSort("started.asc");
    });

    expect(onSearchChange).toHaveBeenCalledWith(
      expect.not.objectContaining({ id: undefined })
    );
  });
});

describe("useCollectWorkspace edit and re-run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getJobFn.mockImplementation(async ({ data }: { data: { jobId: string } }) =>
      buildJobRecord({ id: data.jobId, input: { host: "retry-me.test" } })
    );
    serveRows([loneRow]);
  });

  it("opens the Cap run form prefilled with the selected job's Cap and input", async () => {
    const { result } = renderCollect({ id: LONE_ID }, [dnsCap]);
    await waitFor(() => {
      expect(result.current.jobsWs.detailJob?.id).toBe(LONE_ID);
    });
    act(() => {
      result.current.setRunMode("playbook");
    });
    act(() => {
      result.current.handleEditAndRerun();
    });

    expect(result.current.isRunOpen).toBe(true);
    expect(result.current.runMode).toBe("cap");
    expect(result.current.rerun?.prefill).toEqual({
      capabilityId: "network.dns.lookup",
      runInput: "retry-me.test",
      entityId: "",
    });
  });

  it("drops the prefill when the Run form closes, so an ordinary Run opens empty", async () => {
    const { result } = renderCollect({ id: LONE_ID }, [dnsCap]);
    await waitFor(() => {
      expect(result.current.jobsWs.detailJob?.id).toBe(LONE_ID);
    });
    act(() => {
      result.current.handleEditAndRerun();
    });
    expect(result.current.rerun).not.toBeNull();

    act(() => {
      result.current.handleRunOpenChange(false);
    });

    expect(result.current.isRunOpen).toBe(false);
    expect(result.current.rerun).toBeNull();
  });

  it("gives each Edit and re-run a new form key so the form remounts with it", async () => {
    const { result } = renderCollect({ id: LONE_ID }, [dnsCap]);
    await waitFor(() => {
      expect(result.current.jobsWs.detailJob?.id).toBe(LONE_ID);
    });

    act(() => {
      result.current.handleEditAndRerun();
    });
    const first = result.current.rerun?.key;
    act(() => {
      result.current.handleEditAndRerun();
    });

    expect(result.current.rerun?.key).toBe((first ?? 0) + 1);
  });
});

describe("useCollectWorkspace run target", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serveRows([]);
  });

  it("opens the Cap form on the Library's Cap", () => {
    const { result } = renderCollect({}, [], {
      kind: "cap",
      id: "network.dns.lookup",
    });

    expect(result.current.isRunOpen).toBe(true);
    expect(result.current.runMode).toBe("cap");
    expect(result.current.rerun?.prefill.capabilityId).toBe(
      "network.dns.lookup"
    );
    expect(result.current.initialPlaybookId).toBeUndefined();
  });

  it("opens the Playbook form on the Library's Playbook", () => {
    const { result } = renderCollect({}, [], {
      kind: "playbook",
      id: "host-footprint",
    });

    expect(result.current.isRunOpen).toBe(true);
    expect(result.current.runMode).toBe("playbook");
    expect(result.current.initialPlaybookId).toBe("host-footprint");
    expect(result.current.rerun).toBeNull();
  });

  it("forgets the target when the form closes", () => {
    const { result } = renderCollect({}, [], {
      kind: "playbook",
      id: "host-footprint",
    });

    act(() => {
      result.current.handleRunOpenChange(false);
    });

    expect(result.current.initialPlaybookId).toBeUndefined();
  });

  it("starts closed with no target", () => {
    const { result } = renderCollect();

    expect(result.current.isRunOpen).toBe(false);
    expect(result.current.runMode).toBe("cap");
  });
});
