import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvidenceDetail } from "@/domains/intake/components/evidence-detail";
import type { IntakeEvidenceActions } from "@/domains/intake/hooks/use-intake-actions";
import type { EvidenceRecord } from "@/domains/intake/types";
import {
  emptyEntityPickerPort,
  pickerRouteCaseWrapper,
} from "@/testing/memory-picker-port";
import { buildJobListRecord } from "@/testing/records";
import { render as baseRender, screen, within } from "@/testing/render-in-case";
import { EVIDENCE_HARVEST_CAPABILITY_ID } from "@watchdog/schemas/jobs";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const blobLinks = vi.hoisted(() => ({
  downloadUrl: null as string | null,
  previewUrl: null as string | null,
}));

vi.mock("@/domains/intake/hooks/use-evidence-blob", () => ({
  useEvidenceBlob: () => ({
    downloadUrl: blobLinks.downloadUrl,
    previewUrl: blobLinks.previewUrl,
    loadingUrl: false,
    resolvedText: blobLinks.previewUrl === null ? "dump body" : null,
    loadingBlob: false,
    hasUri: blobLinks.downloadUrl !== null,
    blobPlaceholder: false,
  }),
}));

function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: testId(40),
    caseId: testCaseId(10),
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
    isBusy: false,
    isProcessing: false,
    isAiProcessing: false,
    isEnriching: false,
    isAttaching: false,
    onProcess: vi.fn(),
    onAiProcess: vi.fn(),
    onEnrich: vi.fn(),
    onHide: vi.fn(),
    onRestore: vi.fn(),
    onAttachEntity: vi.fn(),
    ...overrides,
  };
}

function render(ui: ReactElement) {
  return baseRender(ui, { wrapper: pickerRouteCaseWrapper() });
}

describe("EvidenceDetail", () => {
  afterEach(() => {
    blobLinks.downloadUrl = null;
    blobLinks.previewUrl = null;
  });

  it("shows an image from its inline preview link, never from the download link", () => {
    blobLinks.downloadUrl = "https://files.test/a.png?download";
    blobLinks.previewUrl = "https://files.test/a.png?inline";
    render(
      <EvidenceDetail
        entityPort={emptyEntityPickerPort()}
        evidence={evidence({
          kind: "file",
          mime: "image/png",
          uri: "c/a",
          text: null,
        })}
        caseId={testId(10)}
        jobs={[]}
        actions={intakeActions()}
      />
    );

    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://files.test/a.png?inline"
    );
  });

  it("renders no image for a file without a preview link, even an image type", () => {
    blobLinks.downloadUrl = "https://files.test/a.svg?download";
    render(
      <EvidenceDetail
        entityPort={emptyEntityPickerPort()}
        evidence={evidence({
          kind: "file",
          mime: "image/svg+xml",
          uri: "c/a",
          text: null,
        })}
        caseId={testId(10)}
        jobs={[]}
        actions={intakeActions()}
      />
    );

    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows empty detail copy when nothing is selected", () => {
    render(
      <EvidenceDetail
        entityPort={emptyEntityPickerPort()}
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
        entityPort={emptyEntityPickerPort()}
        evidence={evidence()}
        caseId={testId(10)}
        jobs={[]}
        allowedEgress={["local", "model"]}
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

  it("keeps the Jobs cards openable when the link names a playbook step the tab does not list", async () => {
    const user = userEvent.setup();
    const dump = evidence();
    const processJob = buildJobListRecord({
      id: testId(41),
      capabilityId: EVIDENCE_HARVEST_CAPABILITY_ID,
      status: "succeeded",
      input: { evidenceId: dump.id },
    });
    const step = buildJobListRecord({
      id: testId(42),
      playbookRunId: testId(43),
      playbookStep: 1,
      input: { evidenceId: dump.id },
    });

    render(
      <EvidenceDetail
        entityPort={emptyEntityPickerPort()}
        evidence={dump}
        caseId={testId(10)}
        jobs={[processJob, step]}
        focusJobId={step.id}
        actions={intakeActions()}
      />
    );

    await user.click(screen.getByRole("tab", { name: /Jobs/ }));
    // The step is not on the tab, so nothing is controlled: the first card starts open and toggles.
    const card = await screen.findByRole("button", { expanded: true });
    await user.click(card);
    expect(card).toHaveAttribute("aria-expanded", "false");
    await user.click(card);
    expect(card).toHaveAttribute("aria-expanded", "true");
  });
});
