import { describe, expect, it } from "vitest";

import {
  dossierIdentifierColumns,
  type IdentifierTableActions,
} from "@/shared/ui/identifiers/identifier-cells";

const ACTIONS: IdentifierTableActions = {
  updateField: () => {},
  evidenceOptions: [],
  saveEvidence: () => {},
  saveNotes: async () => {},
  onCopyValue: () => {},
  onDeleteIdentifier: () => {},
};

describe("dossierIdentifierColumns", () => {
  it("builds the Dossier identifier columns from its actions", () => {
    const columns = dossierIdentifierColumns(ACTIONS);
    expect(columns).toHaveLength(8);
    expect(columns.some((column) => column.id === "actions")).toBe(true);
  });

  it("rejects a column factory called without its actions", () => {
    // @ts-expect-error the factory requires the actions object
    expect(() => dossierIdentifierColumns()).not.toThrow();
    const partial = { updateField: 1 };
    // @ts-expect-error a wrong actions shape is a compile error
    expect(() => dossierIdentifierColumns(partial)).not.toThrow();
  });
});
