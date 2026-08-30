import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProposalRecord } from "@watchdog/core";
import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/domains/triage/components/triage-decide-header", () => ({
  TriageDecideHeader: () => <div>Triage decide header</div>,
}));

vi.mock("@/domains/triage/components/triage-patch-body", () => ({
  TriagePatchBody: () => <div>Triage patch body</div>,
}));

vi.mock("@/domains/triage/hooks/use-triage-detail-forms", () => ({
  useTriageDetailForms: () => ({
    acceptForm: {},
    rejectForm: {},
    linkedIds: [],
    rejecting: false,
    setRejecting: vi.fn(),
  }),
}));

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
  };
});

import { TriageDetail } from "@/domains/triage/components/triage-detail";

const PROPOSAL: ProposalRecord = {
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
};

describe("TriageDetail", () => {
  it("shows empty detail copy when nothing is selected", () => {
    useQueryMock.mockReturnValue({ data: [], isError: false, isSuccess: true });
    render(
      <TriageDetail
        proposal={null}
        caseId={testId(10)}
        pending={false}
        error={null}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByText("Select a proposal")).toBeInTheDocument();
    expect(useQueryMock).toHaveBeenCalled();
  });

  it("renders decide header and patch body for a selected proposal", () => {
    useQueryMock.mockReturnValue({ data: [], isError: false, isSuccess: true });
    render(
      <TriageDetail
        proposal={PROPOSAL}
        caseId={testId(10)}
        pending={false}
        error={null}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByText("Triage decide header")).toBeInTheDocument();
    expect(screen.getByText("Triage patch body")).toBeInTheDocument();
    expect(screen.queryByText("Select a proposal")).not.toBeInTheDocument();
  });
});
