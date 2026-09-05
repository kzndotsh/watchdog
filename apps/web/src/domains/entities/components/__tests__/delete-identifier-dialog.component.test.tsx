import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/entities/identifiers/identifiers.functions", () => ({
  deleteIdentifierFn: vi.fn(),
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged: vi.fn().mockResolvedValue(undefined),
}));

import { DeleteIdentifierDialog } from "@/domains/entities/components/delete-identifier-dialog";

const TARGET = {
  id: testId(1),
  type: "email",
  value: "user@example.com",
};

function renderDialog(open = true) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <DeleteIdentifierDialog
        caseId={testId(10)}
        target={TARGET}
        open={open}
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>
  );
}

describe("DeleteIdentifierDialog", () => {
  it("shows confirm copy for the selected identifier", () => {
    renderDialog();
    expect(
      screen.getByRole("heading", { name: "Delete identifier" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Remove email “user@example.com” from this Case/)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});
