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
  entitySummary: null,
  entityNotes: null,
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

  it("filters rows by owning entity summary and notes", () => {
    expect(
      identifiersGlobalFilterFn(
        asRow({
          ...ROW,
          entitySummary: "Lead subject in the fraud thread",
        }),
        "value",
        "fraud thread",
        () => {}
      )
    ).toBe(true);
    expect(
      identifiersGlobalFilterFn(
        asRow({
          ...ROW,
          entityNotes: "Mailbox tied to the fraud thread",
        }),
        "value",
        "fraud thread",
        () => {}
      )
    ).toBe(true);
  });

  it("filters identifiers by slug when entity name is blank", () => {
    expect(
      identifiersGlobalFilterFn(
        asRow({ ...ROW, entityName: "  ", entitySlug: "alpha-corp" }),
        "value",
        "alpha-corp",
        () => {}
      )
    ).toBe(true);
    expect(
      identifiersGlobalFilterFn(
        asRow({ ...ROW, entityName: "", entitySlug: "alpha-corp" }),
        "value",
        "Alpha Corp",
        () => {}
      )
    ).toBe(true);
  });

  it("sorts entity column by display label", () => {
    const entityCol = identifiersTableColumns.find(
      (column) => column.id === "entity"
    );
    expect(entityCol).toBeDefined();
    if (entityCol === undefined) return;
    expect("accessorFn" in entityCol && entityCol.accessorFn).toBeTypeOf(
      "function"
    );
    if (!("accessorFn" in entityCol) || entityCol.accessorFn === undefined) {
      return;
    }
    expect(
      entityCol.accessorFn(
        {
          ...ROW,
          entityName: "  ",
          entitySlug: "alpha-corp",
        },
        0
      )
    ).toBe("alpha-corp");
  });

  it("filters rows by platform display label", () => {
    expect(
      identifiersGlobalFilterFn(
        asRow({ ...ROW, type: "handle", platform: "twitter", value: "@ada" }),
        "value",
        "X / Twitter",
        () => {}
      )
    ).toBe(true);
    expect(
      identifiersGlobalFilterFn(
        asRow({ ...ROW, type: "handle", platform: "twitter", value: "@ada" }),
        "value",
        "missing-platform",
        () => {}
      )
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
