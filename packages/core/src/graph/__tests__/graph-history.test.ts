import { describe, expect, it } from "vitest";

import { changedFields, toWireSnapshot } from "../graph-history.ts";

describe("toWireSnapshot", () => {
  it("turns the database's snake_case keys into camelCase", () => {
    expect(
      toWireSnapshot({
        id: "1",
        entity_id: "e",
        retracted_by: null,
        evidence_ids: ["x"],
        superseded_by_claim_id: null,
      })
    ).toEqual({
      id: "1",
      entityId: "e",
      retractedBy: null,
      evidenceIds: ["x"],
      supersededByClaimId: null,
    });
  });

  it("keeps a missing side missing", () => {
    expect(toWireSnapshot(null)).toBeNull();
  });
});

describe("changedFields", () => {
  it("lists exactly the fields whose value differs, sorted", () => {
    expect(
      changedFields(
        { id: "1", text: "old", confidence: "possible", notes: null },
        { id: "1", text: "new", confidence: "confirmed", notes: null }
      )
    ).toEqual(["confidence", "text"]);
  });

  it("ignores updatedAt and updatedBy, which change on every write", () => {
    expect(
      changedFields(
        { text: "same", updatedAt: "2026-01-01", updatedBy: "a" },
        { text: "same", updatedAt: "2026-01-02", updatedBy: "b" }
      )
    ).toEqual([]);
  });

  it("lists every field the row holds for a create or a delete", () => {
    const row = { id: "1", text: "x", updatedAt: "t" };
    expect(changedFields(null, row)).toEqual(["id", "text"]);
    expect(changedFields(row, null)).toEqual(["id", "text"]);
  });

  it("treats a missing field and a null field as different, and equal values as equal", () => {
    expect(changedFields({ a: 1 }, { a: 1, b: null })).toEqual(["b"]);
    expect(changedFields({ ids: ["x", "y"] }, { ids: ["x", "y"] })).toEqual([]);
    expect(changedFields({ ids: ["x"] }, { ids: ["x", "y"] })).toEqual(["ids"]);
  });
});
