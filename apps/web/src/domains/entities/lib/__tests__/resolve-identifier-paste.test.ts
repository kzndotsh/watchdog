import { describe, expect, it } from "vitest";

import {
  applyIdentifierPasteRowOverrides,
  identifierPasteRowKey,
  isIdentifierPasteRowImportable,
} from "@/domains/entities/lib/resolve-identifier-paste";
import { testId } from "@watchdog/test-kit";

describe("resolve-identifier-paste", () => {
  const E1 = testId(1);

  it("builds stable row keys and importability checks", () => {
    expect(identifierPasteRowKey({ sourceIndex: 2, columnIndex: 1 })).toBe(
      "2\u00001"
    );

    expect(
      isIdentifierPasteRowImportable({
        sourceIndex: 0,
        columnIndex: 0,
        sourceLine: "line",
        entityId: E1,
        entityName: "Alice",
        entityError: null,
        type: "email",
        value: "a@example.com",
        platform: "",
        status: "current",
        confidence: "unverified",
        error: null,
        note: null,
      })
    ).toBe(true);
  });

  it("trims padded entityId overrides before matching entities", () => {
    const row = {
      sourceIndex: 0,
      columnIndex: 0,
      sourceLine: "line",
      entityId: null,
      entityName: null,
      entityError: "Entity is required",
      type: "email" as const,
      value: "a@example.com",
      platform: "",
      status: "current" as const,
      confidence: "unverified" as const,
      error: null,
      note: null,
    };
    const entities = [
      { id: E1, name: "Alice", slug: "alice", kind: "person" as const },
    ];
    const key = identifierPasteRowKey(row);
    const [updated] = applyIdentifierPasteRowOverrides(
      [row],
      new Map([[key, { entityId: `  ${E1}  ` }]]),
      entities
    );
    expect(updated?.entityId).toBe(E1);
    expect(updated?.entityError).toBeNull();
  });
});
