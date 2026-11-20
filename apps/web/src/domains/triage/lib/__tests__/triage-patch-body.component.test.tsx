import { useForm } from "@tanstack/react-form";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { useMemo } from "react";
import { describe, expect, it, vi } from "vitest";

import { TriagePatchBody } from "@/domains/triage/components/triage-patch-body";
import type {
  TriageAcceptForm,
  TriageRejectForm,
} from "@/domains/triage/hooks/use-triage-detail-forms";
import type { EvidenceOption } from "@/shared/ui/intake/evidence-option";
import { memoryPickerPort } from "@/testing/memory-picker-port";
import { render, screen } from "@/testing/render-in-case";
import type { ProposalRecord } from "@watchdog/core/proposals";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/intake/components/evidence-preview-drawer", () => ({
  EvidencePreviewDrawer: () => null,
}));

const { port: EVIDENCE_PORT } = memoryPickerPort<EvidenceOption>([], {
  matches: () => true,
});

function proposal(patch: ProposalRecord["patch"]): ProposalRecord {
  return {
    id: testId(50),
    caseId: testCaseId(10),
    jobId: null,
    capabilityId: "network.dns.lookup",
    playbookId: null,
    status: "pending",
    patch,
    summary: null,
    suppressedCount: 0,
    evidenceIds: [],
    rejectReason: null,
    leftOpIds: [],
    rejectedOpIds: [],
    decidedBy: null,
    decidedByLabel: null,
    decidedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    agentSourced: false,
    createdBy: null,
    createdByLabel: null,
  };
}

function Harness({
  row,
  confidence,
}: {
  row: ProposalRecord;
  confidence: "unverified" | "confirmed";
}) {
  const acceptForm = useForm({
    defaultValues: {
      confidence,
      evidenceIds: [] as string[],
      attestationText: "",
      skippedOpIds: [] as string[],
      untickedAs: "left" as const,
    },
    onSubmit: () => {},
  });
  const rejectForm = useForm({
    defaultValues: { rejectReason: "" },
    onSubmit: () => {},
  });
  const client = useMemo(() => new QueryClient(), []);
  return (
    <QueryClientProvider client={client}>
      <TriagePatchBody
        proposal={row}
        caseId={row.caseId}
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TanStack Form vs TriageAcceptForm
        acceptForm={acceptForm as unknown as TriageAcceptForm}
        rejectForm={rejectForm as unknown as TriageRejectForm}
        linkedIds={[]}
        evidencePort={EVIDENCE_PORT}
        missingJobEvidenceCount={0}
        isEvidenceLoading={false}
        evidenceById={new Map()}
        evidenceLoadError={null}
        isPending={false}
        error={null}
        isRejecting={false}
        onRejectingChange={() => {}}
        previewEvidenceId={null}
        onPreviewEvidenceChange={() => {}}
      />
    </QueryClientProvider>
  );
}

describe("TriagePatchBody", () => {
  it("disables Accept when confirmed has no evidence bundle", () => {
    render(
      <Harness
        confidence="confirmed"
        row={proposal([
          {
            kind: "claim.create",
            id: testId(30),
            data: {
              entityId: testId(20),
              text: "Ada observed a host",
              class: "observation",
            },
          },
        ])}
      />
    );
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
  });

  it("disables Accept when an identifier op is invalid", () => {
    render(
      <Harness
        confidence="unverified"
        row={proposal([
          {
            kind: "identifier.create",
            id: testId(31),
            data: {
              entityId: testId(20),
              type: "email",
              value: "not-an-email",
            },
          },
        ])}
      />
    );
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(screen.getByText(/Invalid Identifier values/)).toBeInTheDocument();
  });

  it("enables Accept for unverified with a valid claim", () => {
    render(
      <Harness
        confidence="unverified"
        row={proposal([
          {
            kind: "claim.create",
            id: testId(32),
            data: {
              entityId: testId(20),
              text: "Ada observed a host",
              class: "observation",
            },
          },
        ])}
      />
    );
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
  });

  it("renders when proposal patch is missing", () => {
    render(
      <Harness
        confidence="unverified"
        row={{
          ...proposal([]),
          patch: undefined as unknown as ProposalRecord["patch"],
          summary: "Queued enrichment",
        }}
      />
    );
    expect(screen.getByText("Queued enrichment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
  });

  describe("partial Accept", () => {
    const entityOp: ProposalRecord["patch"][number] = {
      kind: "entity.create",
      id: testId(40),
      data: { name: "Acme", slug: "acme", kind: "org" },
    };
    const onEntity: ProposalRecord["patch"][number] = {
      kind: "identifier.create",
      id: testId(41),
      data: { entityId: testId(40), type: "domain", value: "acme.example" },
    };
    const invalid: ProposalRecord["patch"][number] = {
      kind: "identifier.create",
      id: testId(42),
      data: { entityId: testId(20), type: "email", value: "not-an-email" },
    };

    it("accepts the rest once the invalid change is unticked, and asks what the rest becomes", async () => {
      const user = userEvent.setup();
      render(
        <Harness
          confidence="unverified"
          row={proposal([entityOp, onEntity, invalid])}
        />
      );
      expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();

      await user.click(
        screen.getByRole("checkbox", {
          name: /Accept: Identifier .*not-an-email/,
        })
      );

      expect(
        screen.getByRole("button", { name: "Accept 2 of 3" })
      ).toBeEnabled();
      expect(
        screen.getByRole("combobox", { name: "Unticked changes" })
      ).toHaveTextContent("Leave the rest");
    });

    it("unticks a change on an Entity with the Entity, and ticks the Entity back with it", async () => {
      const user = userEvent.setup();
      render(
        <Harness confidence="unverified" row={proposal([entityOp, onEntity])} />
      );
      const entityBox = screen.getByRole("checkbox", {
        name: /Accept: Entity/,
      });
      const identifierBox = screen.getByRole("checkbox", {
        name: /Accept: Identifier/,
      });

      await user.click(entityBox);
      expect(entityBox).not.toBeChecked();
      expect(identifierBox).not.toBeChecked();
      expect(
        screen.getByRole("button", { name: "Accept 0 of 2" })
      ).toBeDisabled();

      await user.click(identifierBox);
      expect(entityBox).toBeChecked();
      expect(identifierBox).toBeChecked();
      expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
    });

    it("unticks and ticks a whole group, and can reject the rest", async () => {
      const user = userEvent.setup();
      const second: ProposalRecord["patch"][number] = {
        ...onEntity,
        id: testId(43),
        data: { entityId: testId(20), type: "domain", value: "b.example" },
      };
      render(
        <Harness
          confidence="unverified"
          row={proposal([entityOp, onEntity, second])}
        />
      );
      const group = screen.getByRole("checkbox", {
        name: /Accept all Domain Identifiers/,
      });

      await user.click(group);
      expect(group).not.toBeChecked();
      expect(
        screen.getByRole("button", { name: "Accept 1 of 3" })
      ).toBeEnabled();

      await user.click(
        screen.getByRole("combobox", { name: "Unticked changes" })
      );
      await user.click(
        await screen.findByRole("option", { name: "Reject the rest" })
      );
      expect(
        screen.getByRole("combobox", { name: "Unticked changes" })
      ).toHaveTextContent("Reject the rest");

      await user.click(group);
      expect(group).toBeChecked();
      expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
    });

    it("shows which changes a decided partial Accept left or rejected, with no tick boxes", () => {
      render(
        <Harness
          confidence="unverified"
          row={{
            ...proposal([entityOp, onEntity, invalid]),
            status: "accepted",
            leftOpIds: [testId(42)],
            rejectedOpIds: [],
          }}
        />
      );
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      expect(screen.getByText("Left")).toBeInTheDocument();
    });
  });
});
