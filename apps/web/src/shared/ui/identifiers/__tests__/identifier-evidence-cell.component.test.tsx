import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { IdentifierEvidenceCell } from "@/shared/ui/identifiers/identifier-evidence-cell";
import {
  evidenceMatchesPickerFilter,
  type EvidenceOption,
} from "@/shared/ui/intake/evidence-option";
import {
  memoryPickerPort,
  pickerTestWrapper,
} from "@/testing/memory-picker-port";
import { CONFIRMED_REQUIRES_EVIDENCE } from "@watchdog/policy/confirmed-evidence";
import { testId } from "@watchdog/test-kit";

const EVIDENCE_A = {
  id: testId(1),
  kind: "file" as const,
  label: "passport-scan.pdf",
};

const EVIDENCE_B = {
  id: testId(2),
  kind: "url_archive" as const,
  label: "https://example.org/profile",
};

/** The cell's Evidence: the picker searches these; `titles` are the screen's by-ids read. */
function evidenceOf(
  titled: readonly (typeof EVIDENCE_A | typeof EVIDENCE_B)[]
) {
  const { port } = memoryPickerPort<EvidenceOption>([EVIDENCE_A, EVIDENCE_B], {
    matches: evidenceMatchesPickerFilter,
  });
  return {
    port,
    titles: new Map<string, EvidenceOption>(titled.map((row) => [row.id, row])),
  };
}

describe("IdentifierEvidenceCell", () => {
  it("shows Link when empty and opens the editor", async () => {
    const user = userEvent.setup();
    const saveEvidence = vi.fn();

    render(
      <IdentifierEvidenceCell
        row={{
          id: testId(10),
          version: 1,
          confidence: "possible",
          evidenceIds: [],
        }}
        evidence={evidenceOf([])}
        saveEvidence={saveEvidence}
      />,
      { wrapper: pickerTestWrapper() }
    );

    expect(
      screen.getByRole("button", { name: "Link evidence" })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Link evidence" }));
    expect(screen.getByText("Link evidence")).toBeInTheDocument();
    expect(screen.getByLabelText("Evidence options")).toBeInTheDocument();
    expect(await screen.findByText("passport-scan.pdf")).toBeInTheDocument();
  });

  it("shows a labeled chip and preview click when linked", async () => {
    const user = userEvent.setup();
    const onEvidenceClick = vi.fn();

    render(
      <IdentifierEvidenceCell
        row={{
          version: 1,
          id: testId(11),
          confidence: "possible",
          evidenceIds: [EVIDENCE_A.id, EVIDENCE_B.id],
        }}
        evidence={evidenceOf([EVIDENCE_A, EVIDENCE_B])}
        onEvidenceClick={onEvidenceClick}
        saveEvidence={vi.fn()}
      />,
      { wrapper: pickerTestWrapper() }
    );

    expect(screen.getByText("passport-scan.pdf")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Preview evidence passport-scan/ })
    );
    expect(onEvidenceClick).toHaveBeenCalledWith(EVIDENCE_A.id);
  });

  it("blocks Save when confirmed and evidence is cleared", async () => {
    const user = userEvent.setup();
    const saveEvidence = vi.fn();

    render(
      <IdentifierEvidenceCell
        row={{
          version: 1,
          id: testId(12),
          confidence: "confirmed",
          evidenceIds: [EVIDENCE_A.id],
        }}
        evidence={evidenceOf([EVIDENCE_A])}
        saveEvidence={saveEvidence}
      />,
      { wrapper: pickerTestWrapper() }
    );

    await user.click(
      screen.getByRole("button", { name: "Edit evidence links" })
    );
    await user.click(
      await screen.findByRole("checkbox", { name: /passport-scan/ })
    );
    expect(screen.getByText(CONFIRMED_REQUIRES_EVIDENCE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(saveEvidence).not.toHaveBeenCalled();
  });
});
