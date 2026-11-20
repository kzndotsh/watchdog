import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  const RUN = { id: testId(80), proposalCount: 5, pendingCount: 2 };
  const member = (n: number) =>
    buildProposalQueueItem({
      id: testId(n),
      summary: `step ${String(n)}`,
      playbookId: "domain-recon",
      playbookRun: RUN,
      createdAt: "2026-01-01T12:00:00.000Z",
    });

  it("folds a Playbook run into one closed row with the run's counts", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <TriageQueueList
        proposals={[member(1), PROPOSAL, member(2)]}
        selectedId={PROPOSAL.id}
        onSelect={onSelect}
      />
    );

    const run = screen.getByRole("button", {
      name: /run: 5 Proposals, 2 pending/,
    });
    expect(run).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("step 1")).not.toBeInTheDocument();

    await user.click(run);
    expect(screen.getByText("step 1")).toBeVisible();
    expect(screen.getByText("step 2")).toBeVisible();
    expect(
      screen.getByText(/3 more from this run not in this view/)
    ).toBeInTheDocument();
    await user.click(screen.getByText("step 2"));
    expect(onSelect).toHaveBeenCalledWith(testId(2));
  });

  it("opens the run when the selection moves onto one of its Proposals", () => {
    const { rerender } = render(
      <TriageQueueList
        proposals={[member(1), member(2), PROPOSAL]}
        selectedId={PROPOSAL.id}
        onSelect={vi.fn()}
      />
    );
    expect(screen.queryByText("step 2")).not.toBeInTheDocument();

    rerender(
      <TriageQueueList
        proposals={[member(1), member(2), PROPOSAL]}
        selectedId={testId(2)}
        onSelect={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: /run: 5 Proposals/ })
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent(
      "step 2"
    );
  });

  it("keeps a member row mounted when it becomes the selection", async () => {
    const user = userEvent.setup();
    const proposals = [PROPOSAL, member(1), member(2)];
    const { rerender } = render(
      <TriageQueueList
        proposals={proposals}
        selectedId={PROPOSAL.id}
        onSelect={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: /run: 5 Proposals/ }));
    const row = screen.getByRole("option", { name: /step 2/ });
    row.focus();

    rerender(
      <TriageQueueList
        proposals={proposals}
        selectedId={testId(2)}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("option", { name: /step 2/ })).toBe(row);
    expect(row).toHaveFocus();
  });

  it("closes a run by hand even while it holds the selection, and shows no pending count when none is", async () => {
    const user = userEvent.setup();
    const done = { id: testId(81), proposalCount: 2, pendingCount: 0 };
    const rows = [1, 2].map((n) =>
      buildProposalQueueItem({
        id: testId(n),
        summary: `done ${String(n)}`,
        status: "accepted",
        playbookId: "domain-recon",
        playbookRun: done,
      })
    );
    render(
      <TriageQueueList
        proposals={rows}
        selectedId={testId(1)}
        density="compact"
        onSelect={vi.fn()}
      />
    );
    const run = screen.getByRole("button", {
      name: /run: 2 Proposals, 0 pending/,
    });
    expect(run).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText(/pending$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/more from this run/)).not.toBeInTheDocument();
    await user.click(run);
    expect(run).toHaveAttribute("aria-expanded", "false");
  });
});
