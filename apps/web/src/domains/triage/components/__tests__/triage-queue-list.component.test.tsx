import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TriageQueueList } from "@/domains/triage/components/triage-queue-list";
import { buildProposalQueueItem } from "@/testing/records";
import { testId } from "@watchdog/test-kit";

const PROPOSAL = buildProposalQueueItem({
  id: testId(50),
  summary: "dns lookup",
  opCounts: { claim: 1 },
  evidenceCount: 1,
  createdAt: "2026-01-01T12:00:00.000Z",
});

describe("TriageQueueList", () => {
  it("renders grouped proposal rows in the listbox", () => {
    render(
      <TriageQueueList
        proposals={[PROPOSAL]}
        selectedId={PROPOSAL.id}
        onSelect={vi.fn()}
      />
    );

    expect(
      screen.getByRole("listbox", { name: "Proposals" })
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { selected: true })).toBeInTheDocument();
    expect(screen.getByText("dns lookup")).toBeInTheDocument();
    expect(screen.getByText(/1 Claim · 1 ev/)).toBeInTheDocument();
  });
});
