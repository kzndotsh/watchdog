import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useDataTable } from "@/shared/ui/data-table/use-data-table";

describe("useDataTable", () => {
  it("builds a paginated, sortable table from data and columns", () => {
    const { result } = renderHook(() =>
      useDataTable({
        data: [{ id: "1", name: "Alpha" }],
        columns: [{ accessorKey: "name", header: "Name" }],
        getRowId: (row) => row.id,
        pageSize: 10,
      })
    );

    expect(result.current.table.getRowModel().rows).toHaveLength(1);
    expect(result.current.table.state.pagination.pageSize).toBe(10);
  });
});
