import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TriageQueueToolbar } from "@/domains/triage/components/triage-queue-toolbar";
import { PENDING_TRIAGE_FILTERS } from "@/domains/triage/lib/filters";

describe("TriageQueueToolbar", () => {
  it("renders search and pending status filter controls", () => {
    render(
      <TriageQueueToolbar
        filters={PENDING_TRIAGE_FILTERS}
        onFiltersChange={vi.fn()}
        pendingCount={3}
      />
    );

    expect(screen.getByLabelText("Search proposals")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Filters/ })).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("marks the pending count partial while more pages exist", async () => {
    render(
      <TriageQueueToolbar
        filters={PENDING_TRIAGE_FILTERS}
        onFiltersChange={vi.fn()}
        pendingCount={3}
        isCountPartial
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /Filters/ }));
    expect(screen.getByText("(3+ pending)")).toBeInTheDocument();
  });

  it("shows the exact pending count on the last page", async () => {
    render(
      <TriageQueueToolbar
        filters={PENDING_TRIAGE_FILTERS}
        onFiltersChange={vi.fn()}
        pendingCount={3}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /Filters/ }));
    expect(screen.getByText("(3 pending)")).toBeInTheDocument();
  });
});
