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
  invalidateAfterProposalAccept: vi.fn().mockResolvedValue(undefined),
  invalidateAfterProposalQueueChange: vi.fn().mockResolvedValue(undefined),
}));

const useSuspenseQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useSuspenseQuery: (...args: unknown[]) => useSuspenseQueryMock(...args),
    useMutation: (...args: unknown[]) => useMutationMock(...args),
  };
});

import { useTriageWorkspace } from "@/domains/triage/hooks/use-triage-workspace";

const PROPOSALS: ProposalRecord[] = [
  {
    id: testId(50),
    caseId: testId(10),
    jobId: null,
    capabilityId: "network.dns.lookup",
    status: "pending",
    patch: [],
    summary: "dns",
    suppressedCount: 0,
    evidenceIds: [],
    rejectReason: null,
    decidedBy: null,
    decidedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    agentSourced: false,
    userOverridden: false,
    createdBy: null,
    identifierCollisions: [],
  },
  {
    id: testId(51),
    caseId: testId(10),
    jobId: null,
    capabilityId: "network.dns.lookup",
    status: "accepted",
    patch: [],
    summary: "done",
    suppressedCount: 0,
    evidenceIds: [],
    rejectReason: null,
    decidedBy: null,
    decidedAt: "2026-01-02T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    agentSourced: false,
    userOverridden: false,
    createdBy: null,
    identifierCollisions: [],
  },
];

function renderWorkspace(proposalId?: string) {
  useSuspenseQueryMock.mockReturnValue({ data: PROPOSALS });
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

  it("clears search filters to show all proposals", () => {
    const { result } = renderWorkspace();

    act(() => {
      result.current.setFilters({ q: "", statuses: [] });
    });

    expect(result.current.rows).toHaveLength(2);
    expect(result.current.selectedId).toBe(testId(50));
  });
});
