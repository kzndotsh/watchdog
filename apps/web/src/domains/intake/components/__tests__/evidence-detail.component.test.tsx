import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

import { EvidenceDetail } from "@/domains/intake/components/evidence-detail";
import type { IntakeEvidenceActions } from "@/domains/intake/hooks/use-intake-actions";
import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/types";

vi.mock("@/domains/intake/hooks/use-evidence-blob", () => ({
  useEvidenceBlob: () => ({
    isImage: false,
    downloadUrl: null,
    loadingUrl: false,
    resolvedText: "dump body",
    loadingBlob: false,
    hasUri: false,
    blobPlaceholder: false,
  }),
}));

function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: testId(40),
    caseId: testId(10),
    entityId: null,
    kind: "attestation",
    label: "note",
    notes: null,
    mime: "text/plain",
    uri: null,
    sha256: null,
    text: "dump body",
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

describe("EvidenceDetail", () => {
  it("shows empty detail copy when nothing is selected", () => {
    render(
      <EvidenceDetail
        evidence={null}
        caseId={testId(10)}
        jobs={[]}
        actions={intakeActions()}
      />
    );

    expect(screen.getByText("Select evidence")).toBeInTheDocument();
  });

  it("renders header actions and inline preview for selected evidence", async () => {
    const actions = intakeActions();
    const user = userEvent.setup();

    render(
      <EvidenceDetail
        evidence={evidence()}
        caseId={testId(10)}
        jobs={[]}
        allowThirdPartyEgress
        actions={actions}
      />
    );

    expect(screen.getByText("Unattached")).toBeInTheDocument();
    expect(screen.getByText("dump body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Harvest" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide" }));
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Hide" }));

    expect(actions.onHide).toHaveBeenCalledTimes(1);
  });

  it("shows blocked enrich guidance on the output tab", async () => {
    const user = userEvent.setup();
    const enrichJob: JobListRecord = {
      id: testId(12),
      caseId: testId(10),
      capabilityId: "network.url.enrich",
      status: "blocked",
      input: { sourceEvidenceId: testId(40) },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      error: "Missing credential",
      interpretError: null,
      proposalId: null,
      resultSummary: null,
      fromCache: false,
      suppressedCount: 0,
      playbookRunId: null,
      playbookId: null,
      playbookRunStatus: null,
      playbookStep: null,
      evidenceIds: [],
      output: [],
      actorId: "test-actor",
      actorLabel: "test-actor",
      playbookFanIndex: 0,
    };

    render(
      <EvidenceDetail
        evidence={evidence({ sourceUrl: "https://mailhost.test/page" })}
        caseId={testId(10)}
        jobs={[enrichJob]}
        actions={intakeActions()}
      />
    );

    await user.click(screen.getByRole("tab", { name: "Output" }));
    expect(
      screen.getByText(/Enrich blocked — waiting on credentials/)
    ).toBeInTheDocument();
  });
});
