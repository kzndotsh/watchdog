import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EvidenceRecord } from "@/domains/intake/types";
import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/intake/hooks/use-dump-evidence", () => ({
  useDumpEvidence: () => ({
    busy: false,
    uploading: false,
    dumpingPaste: false,
    dumpingUrl: false,
    uploadStatus: null,
    dumpError: null,
    onFiles: vi.fn(),
    onPaste: vi.fn(),
    onUrl: vi.fn(),
  }),
}));

vi.mock("@/domains/intake/components/file-drop-zone", () => ({
  FileDropZone: () => <div>Drop zone</div>,
}));

vi.mock("@/domains/intake/components/dump-dialogs", () => ({
  DumpDialogs: () => null,
}));

import { EntityEvidenceSection } from "@/domains/dossier/components/entity-evidence-section";

const ENTITY_ID = testId(20);

function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: testId(40),
    caseId: testId(10),
    entityId: ENTITY_ID,
    kind: "attestation",
    label: "Screenshot",
    notes: null,
    mime: "image/png",
    uri: null,
    sha256: null,
    text: null,
    sourceUrl: null,
    actorId: "test-actor",
    actorLabel: "test-actor",
    capturedAt: "2026-01-01T00:00:00.000Z",
    processedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("EntityEvidenceSection", () => {
  it("shows inline empty copy when the entity has no evidence", () => {
    render(
      <EntityEvidenceSection
        caseId={testId(10)}
        entityId={ENTITY_ID}
        evidenceOptions={[evidence({ entityId: testId(99) })]}
      />
    );
    expect(
      screen.getByText("No evidence attached yet — dump a file, paste, or URL.")
    ).toBeInTheDocument();
  });

  it("lists entity-scoped evidence rows with processing status", () => {
    render(
      <EntityEvidenceSection
        caseId={testId(10)}
        entityId={ENTITY_ID}
        evidenceOptions={[
          evidence(),
          evidence({ id: testId(41), label: "URL hit" }),
        ]}
        onEvidenceClick={vi.fn()}
      />
    );
    expect(screen.getByText("Screenshot")).toBeInTheDocument();
    expect(screen.getByText("URL hit")).toBeInTheDocument();
    expect(screen.getAllByText("Unprocessed")).toHaveLength(2);
    expect(
      screen.getByRole("group", { name: "Dump evidence" })
    ).toBeInTheDocument();
  });

  it("sorts entity evidence newest captured first", () => {
    render(
      <EntityEvidenceSection
        caseId={testId(10)}
        entityId={ENTITY_ID}
        evidenceOptions={[
          evidence({
            id: testId(41),
            label: "Older dump",
            capturedAt: "2026-01-01T00:00:00.000Z",
          }),
          evidence({
            id: testId(42),
            label: "Newer dump",
            capturedAt: "2026-02-01T00:00:00.000Z",
          }),
        ]}
        onEvidenceClick={vi.fn()}
      />
    );

    const labels = screen
      .getAllByRole("button")
      .map((button) => button.textContent ?? "");
    const newerIndex = labels.findIndex((text) => text.includes("Newer dump"));
    const olderIndex = labels.findIndex((text) => text.includes("Older dump"));
    expect(newerIndex).toBeGreaterThanOrEqual(0);
    expect(olderIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeLessThan(olderIndex);
  });
});
