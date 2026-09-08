import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/domains/entities/identifiers/identifiers.functions", () => ({
  createIdentifierFn: vi.fn(),
}));

vi.mock("@/shared/ui/shadcn/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useMutation: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
    }),
  };
});

import { BulkAddIdentifiersDialog } from "@/domains/entities/components/bulk-add-identifiers-dialog";

describe("BulkAddIdentifiersDialog", () => {
  it("shows paste stage copy and enables Continue after tabular paste", async () => {
    const user = userEvent.setup();
    render(
      <BulkAddIdentifiersDialog
        open
        onOpenChange={vi.fn()}
        caseId={testId(10)}
        entities={[
          {
            id: testId(1),
            name: "Alpha",
            slug: "alpha",
            kind: "person",
          },
        ]}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Bulk add identifiers" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Paste CSV, TSV, or one value per line.")
    ).toBeInTheDocument();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeDisabled();

    await user.type(
      screen.getByLabelText("Paste"),
      "user@example.com\temail\n@handle\thandle"
    );
    expect(continueButton).toBeEnabled();
  });
});
