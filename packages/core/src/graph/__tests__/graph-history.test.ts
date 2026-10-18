import { describe, expect, it } from "vitest";

import { changedFields, historyOpForAction } from "../graph-history.ts";

describe("historyOpForAction", () => {
  it.each([
    ["created", "create"],
    ["updated", "update"],
    ["resolved", "update"],
    ["status_changed", "update"],
    ["reordered", "update"],
    ["retracted", "retract"],
    ["deleted", "delete"],
  ] as const)("maps the %s verb to the %s op", (action, op) => {
    expect(historyOpForAction(action)).toBe(op);
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

  it("compares a Date and its ISO text as the same value", () => {
    const at = new Date("2026-01-01T00:00:00.000Z");
    expect(changedFields({ at }, { at: at.toISOString() })).toEqual([]);
  });
});
