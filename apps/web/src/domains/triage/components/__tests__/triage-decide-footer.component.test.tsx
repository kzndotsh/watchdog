import { useForm } from "@tanstack/react-form";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TriageDecideFooter } from "@/domains/triage/components/triage-decide-footer";
import type {
  TriageAcceptForm,
  TriageRejectForm,
} from "@/domains/triage/hooks/use-triage-detail-forms";
import type { ProposalRecord } from "@watchdog/core/proposals";
import { CONFIRMED_REQUIRES_EVIDENCE } from "@watchdog/policy/confirmed-evidence";
import type { ConfidenceTier } from "@watchdog/schemas/shared";
import { testId } from "@watchdog/test-kit";

vi.mock("@/shared/ui/intake/evidence-picker", () => ({
  EvidencePicker: ({
    selectedIds,
    onChange,
  }: {
    selectedIds: string[];
    onChange: (ids: string[]) => void;
  }) => (
    <div>
      Evidence picker
      <button
        type="button"
        onClick={() => {
          onChange(selectedIds.length > 0 ? [] : ["evidence-1"]);
        }}
      >
        Toggle evidence link
      </button>
    </div>
  ),
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
    playbookId: null,
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
    decidedByLabel: null,
    decidedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    agentSourced: false,
    userOverridden: false,
    createdBy: null,
    createdByLabel: null,
    identifierCollisions: [],
    entityNames: { [testId(20)]: "Alpha" },
    ...overrides,
  };
}

const NO_LINKED_IDS: string[] = [];
const noop = () => {};

function FooterHarness({
  proposal,
  rejecting = false,
  evidenceLoading = false,
  confidence = "unverified",
  attestationText = "",
  linkedIds = NO_LINKED_IDS,
  onAccept = noop,
}: {
  proposal: ProposalRecord;
  rejecting?: boolean;
  evidenceLoading?: boolean;
  confidence?: ConfidenceTier;
  attestationText?: string;
  linkedIds?: string[];
  onAccept?: () => void;
}) {
  const acceptForm = useForm({
    defaultValues: {
      confidence,
      evidenceIds: [] as string[],
      attestationText,
    },
    onSubmit: onAccept,
  });
  const rejectForm = useForm({
    defaultValues: { rejectReason: "" },
    onSubmit: () => {},
  });

  return (
    <>
      <acceptForm.Subscribe
        selector={(state) => state.fieldMeta.evidenceIds?.errors ?? []}
      >
        {(errors) => (
          <output aria-label="Evidence field error">
            {errors.filter((e) => typeof e === "string").join(" ")}
          </output>
        )}
      </acceptForm.Subscribe>
      <TriageDecideFooter
        proposal={proposal}
        acceptForm={acceptForm as unknown as TriageAcceptForm}
        rejectForm={rejectForm as unknown as TriageRejectForm}
        linkedIds={linkedIds}
        caseEvidence={[]}
        missingJobEvidenceCount={0}
        evidenceLoading={evidenceLoading}
        pending={false}
        error={null}
        rejecting={rejecting}
        onRejectingChange={vi.fn()}
      />
    </>
  );
}

async function chooseConfidence(label: string) {
  await userEvent.click(screen.getByRole("combobox", { name: "Confidence" }));
  await userEvent.click(await screen.findByRole("option", { name: label }));
}

const CONFIRMED_WARNING = CONFIRMED_REQUIRES_EVIDENCE;

/** Entity-only patch: Accept needs no confidence tier. */
function proposalWithoutConfidence(): ProposalRecord {
  return pendingProposal({
    patch: [
      {
        op: "create",
        resource: "entity",
        id: testId(20),
        data: { kind: "person", name: "Ada" },
        evidenceIds: [],
      },
    ],
  });
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

  it("shows no confirmed-evidence warning and keeps Accept enabled when the Proposal needs no confidence", async () => {
    const onAccept = vi.fn();
    render(
      <FooterHarness
        proposal={proposalWithoutConfidence()}
        confidence="confirmed"
        onAccept={onAccept}
      />
    );

    expect(screen.queryByText(CONFIRMED_WARNING)).not.toBeInTheDocument();
    const accept = screen.getByRole("button", { name: /Accept/ });
    expect(accept).toBeEnabled();

    await userEvent.click(accept);
    await waitFor(() => {
      expect(onAccept).toHaveBeenCalledTimes(1);
    });
  });

  it("shows the confirmed-evidence warning and disables Accept when the Proposal needs confidence", () => {
    render(
      <FooterHarness proposal={pendingProposal()} confidence="confirmed" />
    );

    expect(screen.getByText(CONFIRMED_WARNING)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Accept/ })).toBeDisabled();
  });

  it("clears the warning and lets Accept submit when linked Evidence alone backs confirmed", async () => {
    const onAccept = vi.fn();
    render(
      <FooterHarness
        proposal={pendingProposal()}
        confidence="confirmed"
        linkedIds={[testId(60)]}
        onAccept={onAccept}
      />
    );

    expect(screen.queryByText(CONFIRMED_WARNING)).not.toBeInTheDocument();
    const accept = screen.getByRole("button", { name: /Accept/ });
    expect(accept).toBeEnabled();

    await userEvent.click(accept);
    await waitFor(() => {
      expect(onAccept).toHaveBeenCalledTimes(1);
    });
  });

  it("clears the warning and lets Accept submit when an attestation alone backs confirmed", async () => {
    const onAccept = vi.fn();
    render(
      <FooterHarness
        proposal={pendingProposal()}
        confidence="confirmed"
        attestationText="Seen first-hand"
        onAccept={onAccept}
      />
    );

    expect(screen.queryByText(CONFIRMED_WARNING)).not.toBeInTheDocument();
    const accept = screen.getByRole("button", { name: /Accept/ });
    expect(accept).toBeEnabled();

    await userEvent.click(accept);
    await waitFor(() => {
      expect(onAccept).toHaveBeenCalledTimes(1);
    });
  });

  describe("evidence field validator (listens to confidence and attestation)", () => {
    const FIELD_ERROR = () => screen.getByLabelText("Evidence field error");

    it("raises the field error when confidence becomes confirmed with no backing, then clears it once Evidence is linked", async () => {
      render(<FooterHarness proposal={pendingProposal()} />);
      expect(FIELD_ERROR()).toHaveTextContent("");

      await chooseConfidence("Confirmed");
      await waitFor(() => {
        expect(FIELD_ERROR()).toHaveTextContent(CONFIRMED_WARNING);
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Toggle evidence link" })
      );
      await waitFor(() => {
        expect(FIELD_ERROR()).toHaveTextContent("");
      });
    });

    it("clears the field error when an attestation alone backs confirmed, and raises it again when removed", async () => {
      render(<FooterHarness proposal={pendingProposal()} />);
      await chooseConfidence("Confirmed");
      await waitFor(() => {
        expect(FIELD_ERROR()).toHaveTextContent(CONFIRMED_WARNING);
      });

      const note = screen.getByPlaceholderText(/Optional attestation note/);
      await userEvent.type(note, "Seen first-hand");
      await waitFor(() => {
        expect(FIELD_ERROR()).toHaveTextContent("");
      });

      await userEvent.clear(note);
      await waitFor(() => {
        expect(FIELD_ERROR()).toHaveTextContent(CONFIRMED_WARNING);
      });
    });

    it("never raises the field error for a lower tier", async () => {
      render(<FooterHarness proposal={pendingProposal()} />);
      await chooseConfidence("Possible");
      expect(FIELD_ERROR()).toHaveTextContent("");
    });
  });
});
