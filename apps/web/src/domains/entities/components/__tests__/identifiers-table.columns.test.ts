import type { Row } from "@tanstack/react-table";
import { describe, expect, it } from "vitest";

import {
  identifiersTableColumns,
  identifiersGlobalFilterFn,
} from "@/domains/entities/components/identifiers-table.columns";
import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import type { DataTableFeatures } from "@/shared/ui/data-table/table-features";
import { testId } from "@watchdog/test-kit";

const ROW: CaseIdentifierRecord = {
  id: testId(1),
  entityId: testId(20),
  entityName: "Alpha Entity",
  entitySlug: "alpha",
  entityKind: "person",
  type: "email",
  platform: "",
  value: "user@example.com",
  confidence: "possible",
  status: "current",
  notes: "work email",
  evidenceIds: [],
};

function asRow(
  record: CaseIdentifierRecord
): Row<DataTableFeatures, CaseIdentifierRecord> {
  return { original: record } as Row<DataTableFeatures, CaseIdentifierRecord>;
}

describe("identifiers-table.columns", () => {
  it("filters rows by value entity labels and metadata", () => {
    expect(
      identifiersGlobalFilterFn(
        asRow(ROW),
        "value",
        "user@example.com",
        () => {}
      )
    ).toBe(true);
    expect(
      identifiersGlobalFilterFn(asRow(ROW), "value", "work email", () => {})
    ).toBe(true);
    expect(
      identifiersGlobalFilterFn(asRow(ROW), "value", "missing", () => {})
    ).toBe(false);
  });

  it("builds expected identifier table columns", () => {
    expect(identifiersTableColumns).toHaveLength(9);
    expect(
      identifiersTableColumns.some((column) => column.id === "evidence")
    ).toBe(true);
    expect(
      identifiersTableColumns.some((column) => column.id === "actions")
    ).toBe(true);
  });
});
