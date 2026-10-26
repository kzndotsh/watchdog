import { describe, expect, it } from "vitest";

import { entityTableColumns } from "@/domains/entities/components/entity-table.columns";

describe("entity-table.columns", () => {
  it("builds expected entity table columns", () => {
    const columns = entityTableColumns;
    expect(columns).toHaveLength(7);
    expect(columns.some((column) => column.id === "connections")).toBe(true);
    expect(columns.some((column) => column.id === "actions")).toBe(true);
    const ids = columns.map((column) => {
      if (column.id) return column.id;
      if ("accessorKey" in column && column.accessorKey != null) {
        return String(column.accessorKey);
      }
      return "";
    });
    expect(ids).toContain("name");
    expect(ids).toContain("updatedAt");
    expect(ids).toContain("notes");
    expect(ids).not.toContain("createdAt");
  });
});
