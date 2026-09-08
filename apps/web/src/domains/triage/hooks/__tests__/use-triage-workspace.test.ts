import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { ProposalRecord } from "@watchdog/core";
import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/domains/triage/triage.functions", () => ({
  acceptProposalFn: vi.fn(),
  rejectProposalFn: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/shared/hooks/use-live-events", () => ({
  useLiveEvents: vi.fn(),
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEvidenceMutation: vi.fn().mockResolvedValue(undefined),
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
import { useLiveEvents } from "@/shared/hooks/use-live-events";
import {
  invalidateAfterEvidenceMutation,
  invalidateAfterProposalQueueChange,
} from "@/shared/lib/query-invalidation";

const PROPOSALS: ProposalRecord[] = [
  {
    id: testId(50),
    caseId: testId(10),
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
    caseId: testId(10),
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

  it("invalidates evidence on evidence_changed live events", () => {
    renderWorkspace();

    const liveCall = vi
      .mocked(useLiveEvents)
      .mock.calls.find((call) => call[0] === testId(10));
    const onEvent = liveCall?.[1];
    onEvent?.({
      type: "evidence_changed",
      caseId: testId(10),
    });

    expect(invalidateAfterEvidenceMutation).toHaveBeenCalledWith(
      expect.any(QueryClient),
      testId(10)
    );
  });

  it("invalidates proposal queue on proposal_created live events", () => {
    renderWorkspace();

    const liveCall = vi
      .mocked(useLiveEvents)
      .mock.calls.find((call) => call[0] === testId(10));
    const onEvent = liveCall?.[1];
    onEvent?.({
      type: "proposal_created",
      caseId: testId(10),
      proposalId: testId(99),
    });

    expect(invalidateAfterProposalQueueChange).toHaveBeenCalledWith(
      expect.any(QueryClient),
      testId(10)
    );
  });

  it("invalidates proposal queue on proposal_queue_changed live events", () => {
    renderWorkspace();

    const liveCall = vi
      .mocked(useLiveEvents)
      .mock.calls.find((call) => call[0] === testId(10));
    const onEvent = liveCall?.[1];
    onEvent?.({
      type: "proposal_queue_changed",
      caseId: testId(10),
    });

    expect(invalidateAfterProposalQueueChange).toHaveBeenCalledWith(
      expect.any(QueryClient),
      testId(10)
    );
  });
});
