import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { IdentifierEvidenceCell } from "@/shared/ui/identifiers/identifier-evidence-cell";
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

describe("IdentifierEvidenceCell", () => {
  it("shows Link when empty and opens the editor", async () => {
    const user = userEvent.setup();
    const saveEvidence = vi.fn();

    render(
      <IdentifierEvidenceCell
        row={{
          id: testId(10),
          confidence: "possible",
          evidenceIds: [],
        }}
        evidenceOptions={[EVIDENCE_A]}
        saveEvidence={saveEvidence}
      />
    );

    expect(
      screen.getByRole("button", { name: "Link evidence" })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Link evidence" }));
    expect(screen.getByText("Link evidence")).toBeInTheDocument();
    expect(screen.getByLabelText("Evidence options")).toBeInTheDocument();
    expect(screen.getByText("passport-scan.pdf")).toBeInTheDocument();
  });

  it("shows a labeled chip and preview click when linked", async () => {
    const user = userEvent.setup();
    const onEvidenceClick = vi.fn();

    render(
      <IdentifierEvidenceCell
        row={{
          id: testId(11),
          confidence: "possible",
          evidenceIds: [EVIDENCE_A.id, EVIDENCE_B.id],
        }}
        evidenceOptions={[EVIDENCE_A, EVIDENCE_B]}
        onEvidenceClick={onEvidenceClick}
        saveEvidence={vi.fn()}
      />
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
          id: testId(12),
          confidence: "confirmed",
          evidenceIds: [EVIDENCE_A.id],
        }}
        evidenceOptions={[EVIDENCE_A]}
        saveEvidence={saveEvidence}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Edit evidence links" })
    );
    await user.click(screen.getByRole("checkbox"));
    expect(
      screen.getByText(/confirmed requires at least 1 evidence/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(saveEvidence).not.toHaveBeenCalled();
  });
});
