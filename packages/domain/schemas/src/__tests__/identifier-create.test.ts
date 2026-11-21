import { describe, expect, it } from "vitest";

import { createIdentifierFieldsSchema } from "../identifier-create";

describe("createIdentifierFieldsSchema", () => {
  it("trims value and optional text fields", () => {
    expect(
      createIdentifierFieldsSchema.parse({
        type: "email",
        value: "  ada@mailhost.test  ",
        confidence: "unverified",
        platform: "  github  ",
        notes: "  note  ",
      })
    ).toEqual({
      type: "email",
      value: "ada@mailhost.test",
      confidence: "unverified",
      platform: "github",
      status: "unknown",
      notes: "note",
    });
  });

  it("trims enum fields and defaults status", () => {
    expect(
      createIdentifierFieldsSchema.parse({
        type: "  email  ",
        value: "ada@mailhost.test",
        confidence: "  possible  ",
        status: "  current  ",
      })
    ).toEqual({
      type: "email",
      value: "ada@mailhost.test",
      confidence: "possible",
      status: "current",
    });
  });

  it("rejects whitespace-only value", () => {
    expect(
      createIdentifierFieldsSchema.safeParse({
        type: "email",
        value: "   ",
        confidence: "unverified",
      }).success
    ).toBe(false);
  });
});
