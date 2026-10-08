import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { ProposalRecord } from "@watchdog/core/proposals";
import type { ActivityEntry } from "@watchdog/schemas/feed";
import type { CaseId } from "@watchdog/schemas/shared";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/domains/triage/triage.functions", () => ({
  acceptProposalFn: vi.fn(),
  rejectProposalFn: vi.fn(),
}));

vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/shared/hooks/use-activity-stream", () => ({
  useActivityEntries: vi.fn(),
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterProposalAccept: vi.fn().mockResolvedValue(undefined),
  invalidateAfterProposalQueueChange: vi.fn().mockResolvedValue(undefined),
}));

const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
    useMutation: (...args: unknown[]) => useMutationMock(...args),
  };
});

import { useTriageWorkspace } from "@/domains/triage/hooks/use-triage-workspace";
import { useActivityEntries } from "@/shared/hooks/use-activity-stream";

const PROPOSALS: ProposalRecord[] = [
  {
    id: testId(50),
    caseId: testCaseId(10),
    jobId: null,
    capabilityId: "network.dns.lookup",
    playbookId: null,
    status: "pending",
    patch: [],
    summary: "dns",
    suppressedCount: 0,
    evidenceIds: [],
    rejectReason: null,
    decidedBy: null,
    decidedByLabel: null,
    decidedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    agentSourced: false,
    userOverridden: false,
    createdBy: null,
    createdByLabel: null,
    identifierCollisions: [],
  },
  {
    id: testId(51),
    caseId: testCaseId(10),
    jobId: null,
    capabilityId: "network.dns.lookup",
    playbookId: null,
    status: "accepted",
    patch: [],
    summary: "done",
    suppressedCount: 0,
    evidenceIds: [],
    rejectReason: null,
    decidedBy: null,
    decidedByLabel: null,
    decidedAt: "2026-01-02T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    agentSourced: false,
    userOverridden: false,
    createdBy: null,
    createdByLabel: null,
    identifierCollisions: [],
  },
];

function proposalEntry(action: string, caseId: CaseId): ActivityEntry {
  return {
    cursor: "0:1",
    id: 1,
    caseId,
    kind: "proposal",
    action,
    subjectId: testId(99),
    groupId: null,
    label: null,
    actorId: null,
    actorLabel: null,
    fromValue: null,
    toValue: null,
    at: "2026-01-01T00:00:00.000Z",
  };
}

function renderWorkspace(proposalId?: string) {
  useQueryMock.mockReturnValue({
    data: PROPOSALS,
    isFetched: true,
    isLoading: false,
    isError: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
  });
  useMutationMock.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  });

  const client = new QueryClient();
  return renderHook(() => useTriageWorkspace(testId(10), { proposalId }), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  });
}

describe("useTriageWorkspace", () => {
  it("defaults to pending-only rows and resolves selection", () => {
    const { result } = renderWorkspace(testId(50));

    expect(result.current.pendingCount).toBe(1);
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.selectedId).toBe(testId(50));
    expect(result.current.selectionOutOfSync).toBe(false);
  });

  it("surfaces proposalsLoadError when the proposals query fails", () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isFetched: true,
      isLoading: false,
      isError: true,
      error: new Error("proposals failed"),
      isPlaceholderData: false,
      refetch: vi.fn(),
    });
    useMutationMock.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    });

    const client = new QueryClient();
    const { result } = renderHook(() => useTriageWorkspace(testId(10), {}), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    });

    expect(result.current.proposalsLoadError).toBe("proposals failed");
  });

  it("clears search filters to show all proposals", () => {
    const { result } = renderWorkspace();

    act(() => {
      result.current.setFilters({ q: "", statuses: [] });
    });

    expect(result.current.rows).toHaveLength(2);
    expect(result.current.selectedId).toBe(testId(50));
  });

  it("holds URL proposal id when filtered out of the visible queue", () => {
    const { result } = renderWorkspace(testId(51));

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0]?.id).toBe(testId(50));
    expect(result.current.selectedId).toBe(testId(51));
    expect(result.current.selectionOutOfSync).toBe(false);
    expect(result.current.selected?.id).toBe(testId(51));
  });

  it("puts the queue back on its pending view when a Proposal entry of this Case arrives", () => {
    const { result } = renderWorkspace();
    act(() => {
      result.current.setFilters({ q: "dns", statuses: [] });
    });
    expect(result.current.rows).toHaveLength(2);

    const onEntry = vi.mocked(useActivityEntries).mock.calls.at(-1)?.[0];
    expect(onEntry).toBeTypeOf("function");
    act(() => {
      onEntry?.(proposalEntry("accepted", testCaseId(10)));
    });

    expect(result.current.filters.q).toBe("dns");
    expect(result.current.filters.statuses).toEqual(["pending"]);
  });

  it("ignores entries of other Cases and other kinds", () => {
    const { result } = renderWorkspace();
    act(() => {
      result.current.setFilters({ q: "", statuses: [] });
    });
    const onEntry = vi.mocked(useActivityEntries).mock.calls.at(-1)?.[0];
    act(() => {
      onEntry?.(proposalEntry("created", testCaseId(11)));
      onEntry?.({ ...proposalEntry("created", testCaseId(10)), kind: "task" });
    });
    expect(result.current.filters.statuses).toEqual([]);
  });
});
