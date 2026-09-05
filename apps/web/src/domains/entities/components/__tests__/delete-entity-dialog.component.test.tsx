import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/entities/entities.functions", () => ({
  deleteEntityFn: vi.fn(),
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged: vi.fn().mockResolvedValue(undefined),
}));

import { DeleteEntityDialog } from "@/domains/entities/components/delete-entity-dialog";

const ENTITY = {
  id: testId(1),
  name: "Alpha Entity",
  slug: "alpha",
};

function renderDialog(open = true) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <DeleteEntityDialog
        caseId={testId(10)}
        entity={ENTITY}
        open={open}
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>
  );
}

describe("DeleteEntityDialog", () => {
  it("shows type-name confirmation copy for the selected entity", () => {
    renderDialog();
    expect(
      screen.getByRole("heading", { name: "Delete entity" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Delete “Alpha Entity” and its identifiers, claims, events, connections, and questions/
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });
});
