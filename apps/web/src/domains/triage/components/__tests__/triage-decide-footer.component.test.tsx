import { useForm } from "@tanstack/react-form";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TriageDecideFooter } from "@/domains/triage/components/triage-decide-footer";
import type {
  TriageAcceptForm,
  TriageRejectForm,
} from "@/domains/triage/hooks/use-triage-detail-forms";
import type { ProposalRecord } from "@watchdog/core";
import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/dossier/components/evidence-picker", () => ({
  EvidencePicker: () => <div>Evidence picker</div>,
  EvidenceCiteChips: () => <div>Evidence cites</div>,
  EvidenceSlotSkeleton: ({ mode }: { mode: string }) => (
    <div aria-label="Loading evidence">Loading {mode}</div>
  ),
}));

function pendingProposal(
  overrides: Partial<ProposalRecord> = {}
): ProposalRecord {
  return {
    id: testId(50),
    caseId: testId(10),
    jobId: null,
    capabilityId: "network.dns.lookup",
    status: "pending",
    patch: [
      {
        op: "create",
        resource: "claim",
        id: testId(30),
        data: {
          entityId: testId(20),
          text: "Ada observed a host",
          class: "observation",
        },
        evidenceIds: [],
      },
    ],
    summary: "dns lookup",
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
    entityNames: { [testId(20)]: "Alpha" },
    ...overrides,
  };
}

function FooterHarness({
  proposal,
  rejecting = false,
  evidenceLoading = false,
}: {
  proposal: ProposalRecord;
  rejecting?: boolean;
  evidenceLoading?: boolean;
}) {
  const acceptForm = useForm({
    defaultValues: {
      confidence: "unverified" as const,
      evidenceIds: [] as string[],
      attestationText: "",
    },
    onSubmit: () => {},
  });
  const rejectForm = useForm({
    defaultValues: { rejectReason: "" },
    onSubmit: () => {},
  });

  return (
    <TriageDecideFooter
      proposal={proposal}
      acceptForm={acceptForm as unknown as TriageAcceptForm}
      rejectForm={rejectForm as unknown as TriageRejectForm}
      linkedIds={[]}
      caseEvidence={[]}
      missingJobEvidenceCount={0}
      evidenceLoading={evidenceLoading}
      pending={false}
      error={null}
      rejecting={rejecting}
      onRejectingChange={vi.fn()}
    />
  );
}

describe("TriageDecideFooter", () => {
  it("renders accept controls beside footer actions", () => {
    render(<FooterHarness proposal={pendingProposal()} />);

    expect(screen.getByText("Evidence picker")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(
      screen.getByText(/No evidence selected — Accept will still apply/)
    ).toBeInTheDocument();
  });

  it("shows evidence loading shell beside confidence while Case evidence loads", () => {
    render(<FooterHarness proposal={pendingProposal()} evidenceLoading />);

    expect(screen.getByLabelText("Loading evidence")).toHaveTextContent(
      "Loading pick"
    );
    expect(screen.queryByText("Evidence picker")).not.toBeInTheDocument();
  });

  it("shows reject composer in the footer", () => {
    render(<FooterHarness proposal={pendingProposal()} rejecting />);

    expect(
      screen.getByPlaceholderText("Reject reason (optional)")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm Reject" })
    ).toBeInTheDocument();
  });
});
