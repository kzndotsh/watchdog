import { describe, expect, it } from "vitest";

import { identifiersTableColumns } from "@/domains/entities/components/identifiers-table.columns";

describe("identifiers-table.columns", () => {
  it("builds expected identifier table columns", () => {
    const columns = identifiersTableColumns;
    expect(columns).toHaveLength(9);
    expect(columns.some((column) => column.id === "evidence")).toBe(true);
    expect(columns.some((column) => column.id === "actions")).toBe(true);
  });

  // Search runs on the server now (`identifierList`), so no column filters in the browser.
  it("declares no client filter", () => {
    expect(identifiersTableColumns.some((column) => "filterFn" in column)).toBe(
      false
    );
  });
});
