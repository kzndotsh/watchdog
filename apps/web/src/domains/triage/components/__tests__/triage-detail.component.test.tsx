import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProposalRecord } from "@watchdog/core";
import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/domains/triage/components/triage-decide-header", () => ({
  TriageDecideHeader: () => <div>Triage decide header</div>,
}));

const triagePatchBodyProps = vi.hoisted(() => vi.fn());

vi.mock("@/domains/triage/components/triage-patch-body", () => ({
  TriagePatchBody: (props: { evidenceLoadError: string | null }) => {
    triagePatchBodyProps(props);
    return <div>Triage patch body</div>;
  },
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

function fetchedEvidenceQuery(data: unknown[] = []) {
  return {
    data,
    isFetched: true,
    isLoading: false,
    isError: false,
    isSuccess: true,
  };
}

const PROPOSAL: ProposalRecord = {
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
};

describe("TriageDetail", () => {
  beforeEach(() => {
    triagePatchBodyProps.mockClear();
  });

  it("shows empty detail copy when nothing is selected", () => {
    useQueryMock.mockReturnValue(fetchedEvidenceQuery());
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
    expect(useQueryMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("renders decide header and patch body for a selected proposal", () => {
    useQueryMock.mockReturnValue(fetchedEvidenceQuery());
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
    expect(useQueryMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("defers evidence load errors until both evidence queries settle", () => {
    useQueryMock.mockImplementation(
      (opts: { queryKey?: readonly unknown[] }) => {
        const hiddenOnly = opts.queryKey?.[3] === "hidden";
        if (hiddenOnly) {
          return {
            data: undefined,
            isFetched: false,
            isLoading: true,
            isError: false,
            isSuccess: false,
            isPlaceholderData: false,
            error: null,
          };
        }
        return {
          data: undefined,
          isFetched: true,
          isLoading: false,
          isError: true,
          isSuccess: false,
          isPlaceholderData: false,
          error: new Error("Active evidence failed"),
        };
      }
    );

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

    expect(triagePatchBodyProps).toHaveBeenCalled();
    expect(triagePatchBodyProps.mock.calls.at(-1)?.[0]).toMatchObject({
      evidenceLoading: true,
      evidenceLoadError: null,
    });
  });
});
