import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/shared/layout/app-breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}));

vi.mock("@/shared/ui/shadcn/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Menu</button>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/domains/entities/components/bulk-add-identifiers-dialog", () => ({
  BulkAddIdentifiersDialog: ({ open }: { open: boolean }) =>
    open ? <div>Bulk identifiers dialog</div> : null,
}));

vi.mock("@/shared/ui/identifiers/identifier-composer", () => ({
  IdentifierComposerAppend: () => null,
}));

vi.mock("@/shared/ui/data-table", () => ({
  DataTable: ({ emptyText }: { emptyText?: string }) => (
    <div data-testid="identifiers-data-table">{emptyText}</div>
  ),
  DataTableAddRow: ({
    label,
    onClick,
  }: {
    label: string;
    onClick: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  DataTablePagination: () => null,
  DataTableViewOptions: () => null,
}));

const useSuspenseQueryMock = vi.hoisted(() => vi.fn());
const useIdentifiersTableMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useSuspenseQuery: (...args: unknown[]) => useSuspenseQueryMock(...args),
  };
});

vi.mock("@/domains/entities/hooks/use-identifiers-table", () => ({
  useIdentifiersTable: (...args: unknown[]) => useIdentifiersTableMock(...args),
}));

import { IdentifiersPage } from "@/domains/entities/components/identifiers-page";

const ACTIVE: CaseRecord = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowThirdPartyEgress: false,
};

function mockIdentifiersTable() {
  useIdentifiersTableMock.mockReturnValue({
    rows: [],
    table: {},
    columns: [{ id: "value" }],
    createForm: {},
    search: "",
    setSearch: vi.fn(),
    typeFilter: [],
    setTypeFilter: vi.fn(),
    statusFilter: [],
    setStatusFilter: vi.fn(),
    confidenceFilter: [],
    setConfidenceFilter: vi.fn(),
    submitError: null,
    composing: false,
    openComposer: vi.fn(),
    closeComposer: vi.fn(),
    submitCreate: vi.fn(),
    onComposerKey: vi.fn(),
    filterChips: [],
    emptyText: "No identifiers yet — add one below.",
    onRowClick: vi.fn(),
    entityOptions: [],
    evidenceOptions: [],
  });
}

describe("IdentifiersPage", () => {
  it("prompts for an active case when none is selected", () => {
    useSuspenseQueryMock.mockReturnValue({
      data: { cases: [], active: null },
    });

    render(<IdentifiersPage />);
    expect(screen.getByRole("link", { name: "Select a case" })).toHaveAttribute(
      "href",
      "/cases"
    );
    expect(
      screen.queryByLabelText("Search identifiers")
    ).not.toBeInTheDocument();
  });

  it("renders identifier toolbar controls and opens bulk dialog", async () => {
    const user = userEvent.setup();
    useSuspenseQueryMock.mockReturnValue({
      data: { cases: [ACTIVE], active: ACTIVE },
    });
    mockIdentifiersTable();

    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <IdentifiersPage />
      </QueryClientProvider>
    );

    expect(screen.getByLabelText("Search identifiers")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Bulk add" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add identifier" })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Bulk add" }));
    expect(screen.getByText("Bulk identifiers dialog")).toBeInTheDocument();
    expect(useIdentifiersTableMock).toHaveBeenCalledWith(ACTIVE);
  });
});
