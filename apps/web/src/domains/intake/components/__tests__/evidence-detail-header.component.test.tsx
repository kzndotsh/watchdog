import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  EvidenceDetailHeader,
  EvidenceHeaderActions,
} from "@/domains/intake/components/evidence-detail-header";
import type { IntakeEvidenceActions } from "@/domains/intake/hooks/use-intake-actions";
import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/jobs.functions";
import { Tabs } from "@/shared/ui/shadcn/tabs";
import { capabilityLabel } from "@/shared/ui/vocab";
import { testId } from "@watchdog/test-kit";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    to?: string;
  }) => <a {...props}>{children}</a>,
}));

function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: testId(40),
    caseId: testId(10),
    entityId: null,
    kind: "attestation",
    label: "note",
    notes: "Analyst note",
    mime: "text/plain",
    uri: null,
    sha256: null,
    text: "hello",
    sourceUrl: null,
    actorId: "test-actor",
    actorLabel: "test-actor",
    capturedAt: "2026-01-01T00:00:00.000Z",
    processedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function intakeActions(
  overrides: Partial<IntakeEvidenceActions> = {}
): IntakeEvidenceActions {
  return {
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
    ...overrides,
  };
}

describe("EvidenceDetailHeader", () => {
  it("renders evidence identity and tabs", () => {
    render(
      <Tabs value="content">
        <EvidenceDetailHeader
          evidence={evidence()}
          isHidden={false}
          producingCap={null}
          canEnrich={false}
          enrichJobs={[]}
          enrichOutput={null}
          relatedJobs={[]}
        />
      </Tabs>
    );

    expect(screen.getByText("Unattached")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Content" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Jobs" })).toBeInTheDocument();
  });

  it("shows the resolved actor label instead of the raw actor id", () => {
    render(
      <Tabs value="content">
        <EvidenceDetailHeader
          evidence={evidence({
            actorId: "user-uuid",
            actorLabel: "ada",
          })}
          isHidden={false}
          producingCap={null}
          canEnrich={false}
          enrichJobs={[]}
          enrichOutput={null}
          relatedJobs={[]}
        />
      </Tabs>
    );

    expect(screen.getByText("ada")).toBeInTheDocument();
    expect(screen.getByText("By")).toBeInTheDocument();
    expect(screen.queryByText("user-uuid")).not.toBeInTheDocument();
  });

  it("opens the producing Cap on the Jobs tab", async () => {
    const onShowProducingRun = vi.fn();
    const producingCap = {
      id: testId(11),
      capabilityId: "network.dns.lookup",
    } as JobListRecord;

    render(
      <Tabs value="content">
        <EvidenceDetailHeader
          evidence={evidence()}
          isHidden={false}
          producingCap={producingCap}
          canEnrich={false}
          enrichJobs={[]}
          enrichOutput={null}
          relatedJobs={[producingCap]}
          onShowProducingRun={onShowProducingRun}
        />
      </Tabs>
    );

    await userEvent.setup().click(
      screen.getByRole("button", {
        name: capabilityLabel(producingCap.capabilityId),
      })
    );
    expect(onShowProducingRun).toHaveBeenCalledWith(producingCap.id);
  });
});

describe("EvidenceHeaderActions", () => {
  it("shows harvest controls for active evidence", () => {
    render(
      <EvidenceHeaderActions
        isHidden={false}
        actions={intakeActions()}
        canEnrich={false}
        processed={false}
        allowThirdPartyEgress
        onHideRequested={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Harvest" })).toBeInTheDocument();
    expect(screen.getAllByText("Extract (AI)").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
  });

  it("shows restore when evidence is hidden", () => {
    render(
      <EvidenceHeaderActions
        isHidden
        actions={intakeActions()}
        canEnrich={false}
        processed={false}
        onHideRequested={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });
});
