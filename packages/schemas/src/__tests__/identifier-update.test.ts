import { describe, expect, it } from "vitest";

import { identifierUpdateFieldsSchema } from "../identifier-update";

describe("identifierUpdateFieldsSchema", () => {
  it("trims value and maps blank platform to null for PATCH clearing", () => {
    expect(
      identifierUpdateFieldsSchema.parse({
        value: "  ada@mailhost.test  ",
        platform: "   ",
        notes: "  note  ",
      })
    ).toEqual({
      value: "ada@mailhost.test",
      platform: null,
      notes: "note",
    });
  });

  it("trims enum fields on PATCH", () => {
    expect(
      identifierUpdateFieldsSchema.parse({
        type: "  email  ",
        status: "  current  ",
        confidence: "  possible  ",
      })
    ).toEqual({
      type: "email",
      status: "current",
      confidence: "possible",
    });
  });

  it("treats blank optional enum fields as undefined", () => {
    expect(
      identifierUpdateFieldsSchema.parse({
        type: "   ",
        status: "   ",
        confidence: "   ",
      })
    ).toEqual({});
  });

  it("rejects whitespace-only value", () => {
    const result = identifierUpdateFieldsSchema.safeParse({ value: "   " });
    expect(result.success).toBe(false);
  });
});
