import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EvidenceCiteChips } from "@/shared/ui/intake/evidence-cite-chips";
import { EvidenceSlotSkeleton } from "@/shared/ui/intake/evidence-slot-skeleton";
import { ListedEvidencePicker } from "@/shared/ui/intake/listed-evidence-picker";
import { testId } from "@watchdog/test-kit";

const OPTION = {
  id: testId(1),
  kind: "attestation" as const,
  label: "Photo",
};

describe("ListedEvidencePicker", () => {
  it("renders the add-evidence trigger when nothing is selected", () => {
    render(
      <ListedEvidencePicker
        options={[OPTION]}
        selectedIds={[]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Add evidence")).toBeInTheDocument();
  });
});

describe("EvidenceCiteChips re-export", () => {
  it("renders cite chips for selected evidence ids", () => {
    render(<EvidenceCiteChips options={[OPTION]} ids={[OPTION.id]} />);
    expect(screen.getByText("Evidence")).toBeInTheDocument();
    expect(screen.getByText(/Photo/)).toBeInTheDocument();
  });
});

describe("EvidenceSlotSkeleton re-export", () => {
  it("renders cite-mode loading chips", () => {
    render(<EvidenceSlotSkeleton mode="cite" citeCount={2} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading evidence");
  });

  it("renders pick-mode loading trigger", () => {
    const { container } = render(<EvidenceSlotSkeleton mode="pick" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading evidence");
    expect(container.querySelector(".border-dashed")).toBeInTheDocument();
  });
});
