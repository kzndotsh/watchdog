import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "@/shared/ui/data-table/data-table";
import { useDataTable } from "@/shared/ui/data-table/use-data-table";

function TableHarness({
  onRowClick,
}: {
  onRowClick?: (row: { name: string }) => void;
}) {
  const { table } = useDataTable({
    data: [{ name: "Alpha" }],
    columns: [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ getValue }) => getValue(),
      },
    ],
  });

  return (
    <DataTable table={table} onRowClick={onRowClick} emptyText="Nothing here" />
  );
}

describe("DataTable", () => {
  it("renders rows and handles row clicks outside interactive controls", () => {
    const onRowClick = vi.fn();
    render(<TableHarness onRowClick={onRowClick} />);

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByText("Alpha"), { button: 0 });
    fireEvent.click(screen.getByText("Alpha"));
    expect(onRowClick).toHaveBeenCalledWith({ name: "Alpha" });
  });

  it("shows empty text when there are no rows", () => {
    function EmptyTable() {
      const { table } = useDataTable({
        data: [],
        columns: [{ accessorKey: "name", header: "Name" }],
      });
      return <DataTable table={table} emptyText="Nothing here" />;
    }

    render(<EmptyTable />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("renders per-column skeleton rows while pending (colgroup-aligned)", () => {
    function PendingTable() {
      const { table } = useDataTable({
        data: [],
        columns: [
          { accessorKey: "a", header: "A", size: 200 },
          { accessorKey: "b", header: "B", size: 100 },
        ],
      });
      return (
        <DataTable
          table={table}
          pending
          pendingLabel="Loading rows"
          skeletonRows={2}
        />
      );
    }

    render(<PendingTable />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading rows");
    const tbody = document.querySelector("tbody");
    expect(tbody?.querySelectorAll("tr")).toHaveLength(2);
    expect(tbody?.querySelectorAll("td")).toHaveLength(4);
  });
});
