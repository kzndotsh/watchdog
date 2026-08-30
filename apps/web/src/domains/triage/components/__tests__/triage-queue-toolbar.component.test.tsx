import { render, screen } from "@testing-library/react";
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
});
