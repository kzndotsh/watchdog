import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { pickerTestWrapper } from "@/testing/memory-picker-port";
import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/entities/identifiers/identifiers.functions", () => ({
  createIdentifierFn: vi.fn(),
}));

const entityReads = vi.hoisted(() => ({
  matchEntityNamesFn: vi.fn(),
  listEntitiesFn: vi.fn(),
  listEntitiesPageFn: vi.fn(),
  listEntitiesPickerPageFn: vi.fn(),
  getEntitiesFn: vi.fn(),
}));
vi.mock("@/domains/entities/entities.functions", () => entityReads);

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

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
  beforeEach(() => {
    vi.clearAllMocks();
    entityReads.listEntitiesPickerPageFn.mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    entityReads.getEntitiesFn.mockResolvedValue([]);
  });

  it("shows paste stage copy and enables Continue after tabular paste", async () => {
    const user = userEvent.setup();
    render(
      <BulkAddIdentifiersDialog
        open
        onOpenChange={vi.fn()}
        caseId={testId(10)}
      />,
      { wrapper: pickerTestWrapper() }
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

  it("matches the pasted Entity names on the server, once, and never reads the whole list", async () => {
    const user = userEvent.setup();
    entityReads.matchEntityNamesFn.mockResolvedValue([
      { id: testId(1), name: "Alice Ng", slug: "alice-ng", kind: "person" },
      { id: testId(2), name: "Acme Corp", slug: "acme-corp", kind: "org" },
      { id: testId(3), name: "Acme Corp", slug: "acme-corp-2", kind: "org" },
    ]);
    render(
      <BulkAddIdentifiersDialog
        open
        onOpenChange={vi.fn()}
        caseId={testId(10)}
      />,
      { wrapper: pickerTestWrapper() }
    );

    await user.click(screen.getByLabelText("Paste"));
    await user.paste(
      "entity,email\nalice ng,a@example.com\nAcme Corp,b@example.com\nNobody,c@example.com"
    );
    expect(entityReads.matchEntityNamesFn).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(entityReads.matchEntityNamesFn).toHaveBeenCalledTimes(1);
    });
    expect(entityReads.matchEntityNamesFn).toHaveBeenCalledWith({
      data: {
        caseId: testId(10),
        names: ["Acme Corp", "Nobody", "alice ng"],
      },
    });
    // The browser's rule runs over the answer: one match resolves, two are ambiguous, none is unknown.
    expect(
      await screen.findByRole("button", { name: "Import 1 identifier" })
    ).toBeEnabled();
    expect(entityReads.listEntitiesFn).not.toHaveBeenCalled();
    expect(entityReads.listEntitiesPageFn).not.toHaveBeenCalled();
  });
});
