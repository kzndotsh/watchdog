import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";

vi.mock("@/domains/cases/cases.functions", () => ({
  deleteCaseFn: vi.fn(),
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterCaseSwitch: vi.fn().mockResolvedValue(undefined),
}));

import { DeleteCaseDialog } from "@/domains/cases/components/delete-case-dialog";

const CASE: CaseRecord = {
  id: "case-1",
  slug: "alpha",
  name: "Alpha Case",
  description: null,
  allowThirdPartyEgress: false,
};

function renderDialog(open = true) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <DeleteCaseDialog caseRow={CASE} open={open} onOpenChange={vi.fn()} />
    </QueryClientProvider>
  );
}

describe("DeleteCaseDialog", () => {
  it("shows the destructive confirmation copy for the selected case", () => {
    renderDialog();
    expect(
      screen.getByRole("heading", { name: "Delete case" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Delete “Alpha Case” and everything in it — entities, evidence, collect, triage, and tasks\./
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });
});
