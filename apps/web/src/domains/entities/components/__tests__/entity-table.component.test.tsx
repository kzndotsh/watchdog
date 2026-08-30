import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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

vi.mock("@/shared/ui/data-table", () => ({
  DataTable: ({ emptyText }: { emptyText?: string }) => (
    <div data-testid="entity-data-table">{emptyText}</div>
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
  DataTableComposerRow: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DataTableComposerActions: () => null,
  DataTablePagination: () => null,
  DataTableViewOptions: () => null,
  EditableSelectCell: () => null,
  TableComposerInput: () => null,
}));

const useSuspenseQueryMock = vi.hoisted(() => vi.fn());
const useEntityTableMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useSuspenseQuery: (...args: unknown[]) => useSuspenseQueryMock(...args),
  };
});

vi.mock("@/domains/entities/hooks/use-entity-table", () => ({
  useEntityTable: (...args: unknown[]) => useEntityTableMock(...args),
}));

import { EntityTable } from "@/domains/entities/components/entity-table";

const ACTIVE: CaseRecord = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowThirdPartyEgress: false,
};

function mockEntityTable() {
  useEntityTableMock.mockReturnValue({
    rows: [{ id: testId(1), name: "Alpha Entity", slug: "alpha" }],
    table: {},
    columns: [{ id: "name" }],
    createForm: {
      Field: () => null,
      Subscribe: () => null,
      reset: vi.fn(),
      state: { isSubmitting: false, values: { name: "", kind: "person" } },
      getFieldValue: vi.fn(() => ""),
      handleSubmit: vi.fn(),
    },
    search: "",
    setSearch: vi.fn(),
    kindFilter: [],
    setKindFilter: vi.fn(),
    submitError: null,
    composing: false,
    openComposer: vi.fn(),
    closeComposer: vi.fn(),
    submitCreate: vi.fn(),
    onComposerKey: vi.fn(),
    filterChips: [],
    emptyText: "No entities yet — add one below.",
    onRowClick: vi.fn(),
  });
}

describe("EntityTable", () => {
  it("prompts for an active case when none is selected", () => {
    useSuspenseQueryMock.mockReturnValue({
      data: { cases: [], active: null },
    });

    render(<EntityTable />);
    expect(screen.getByRole("link", { name: "Select a case" })).toHaveAttribute(
      "href",
      "/cases"
    );
    expect(screen.queryByLabelText("Search entities")).not.toBeInTheDocument();
    expect(useSuspenseQueryMock).toHaveBeenCalled();
  });

  it("renders entity search and create controls for the active case", () => {
    useSuspenseQueryMock.mockReturnValue({
      data: { cases: [ACTIVE], active: ACTIVE },
    });
    mockEntityTable();

    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <EntityTable />
      </QueryClientProvider>
    );

    expect(screen.getByLabelText("Search entities")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
    expect(
      screen.getByText("No entities yet — add one below.")
    ).toBeInTheDocument();
    expect(useEntityTableMock).toHaveBeenCalledWith(ACTIVE);
  });
});
