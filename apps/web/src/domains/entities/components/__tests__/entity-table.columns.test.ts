import type { Row } from "@tanstack/react-table";
import { describe, expect, it } from "vitest";

import {
  entityGlobalFilterFn,
  entityTableColumns,
} from "@/domains/entities/components/entity-table.columns";
import type { EntityRecord } from "@/domains/entities/types";
import type { DataTableFeatures } from "@/shared/ui/data-table/table-features";
import { testId } from "@watchdog/test-kit";

const ENTITY: EntityRecord = {
  id: testId(1),
  caseId: testId(10),
  slug: "alpha",
  name: "Alpha Entity",
  kind: "person",
  summary: "Lead subject",
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function asRow(entity: EntityRecord): Row<DataTableFeatures, EntityRecord> {
  return { original: entity } as Row<DataTableFeatures, EntityRecord>;
}

describe("entity-table.columns", () => {
  it("filters rows by name slug kind and summary", () => {
    expect(entityGlobalFilterFn(asRow(ENTITY), "name", "lead", () => {})).toBe(
      true
    );
    expect(
      entityGlobalFilterFn(asRow(ENTITY), "name", "person", () => {})
    ).toBe(true);
    expect(
      entityGlobalFilterFn(asRow(ENTITY), "name", "missing", () => {})
    ).toBe(false);
    expect(entityGlobalFilterFn(asRow(ENTITY), "name", "", () => {})).toBe(
      true
    );
  });

  it("builds expected entity table columns", () => {
    expect(entityTableColumns).toHaveLength(7);
    expect(
      entityTableColumns.some((column) => column.id === "connections")
    ).toBe(true);
    expect(entityTableColumns.some((column) => column.id === "actions")).toBe(
      true
    );
    const ids = entityTableColumns.map((column) => {
      if (column.id) return column.id;
      if ("accessorKey" in column && column.accessorKey != null) {
        return String(column.accessorKey);
      }
      return "";
    });
    expect(ids).toContain("updatedAt");
    expect(ids).toContain("notes");
    expect(ids).not.toContain("createdAt");
  });
});
