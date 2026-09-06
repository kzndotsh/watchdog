import type { Column } from "@tanstack/react-table";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DataTableColumnHeader } from "@/shared/ui/data-table/data-table-column-header";
import type { DataTableFeatures } from "@/shared/ui/data-table/table-features";

describe("DataTableColumnHeader", () => {
  it("renders a plain title when sorting is disabled", () => {
    const column = {
      getCanSort: () => false,
    } as Column<DataTableFeatures, Record<string, unknown>>;

    render(<DataTableColumnHeader column={column} title="Name" />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("toggles sorting when the header button is clicked", () => {
    const toggleSorting = vi.fn();
    const column = {
      getCanSort: () => true,
      getIsSorted: () => "asc" as const,
      toggleSorting,
    } as unknown as Column<DataTableFeatures, Record<string, unknown>>;

    render(<DataTableColumnHeader column={column} title="Status" />);
    fireEvent.click(screen.getByRole("button", { name: "Status" }));
    expect(toggleSorting).toHaveBeenCalledWith(true);
  });
});
