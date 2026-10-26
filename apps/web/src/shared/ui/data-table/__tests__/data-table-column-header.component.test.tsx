import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DataTableColumnHeader } from "@/shared/ui/data-table/data-table-column-header";
import type { SortableColumn } from "@/shared/ui/data-table/data-table-column-header";

describe("DataTableColumnHeader", () => {
  it("renders a plain title when sorting is disabled", () => {
    const column: SortableColumn = {
      getCanSort: () => false,
      getIsSorted: () => false,
      toggleSorting: vi.fn(),
    };

    render(<DataTableColumnHeader column={column} title="Name" />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("toggles sorting when the header button is clicked", () => {
    const toggleSorting = vi.fn();
    const column: SortableColumn = {
      getCanSort: () => true,
      getIsSorted: () => "asc",
      toggleSorting,
    };

    render(<DataTableColumnHeader column={column} title="Status" />);
    fireEvent.click(screen.getByRole("button", { name: "Status" }));
    expect(toggleSorting).toHaveBeenCalledWith(true);
  });
});
