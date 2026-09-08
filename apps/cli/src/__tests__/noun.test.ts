import { describe, expect, it } from "vitest";

import { asBoolean, hasCliText, pickDefined } from "../noun";

describe("noun helpers", () => {
  it("asBoolean accepts only boolean values", () => {
    expect(asBoolean(true)).toBe(true);
    expect(asBoolean(false)).toBe(false);
    expect(asBoolean("true")).toBeUndefined();
    expect(asBoolean(1)).toBeUndefined();
  });

  it("pickDefined drops undefined, empty, and whitespace-only strings", () => {
    expect(
      pickDefined({
        keep: "value",
        trimmed: "  spaced  ",
        dropUndefined: undefined,
        dropEmpty: "",
        dropWhitespace: "   ",
        zero: 0,
      })
    ).toEqual({ keep: "value", trimmed: "spaced", zero: 0 });
  });

  it("hasCliText accepts only non-blank strings", () => {
    expect(hasCliText("x")).toBe(true);
    expect(hasCliText("  x  ")).toBe(true);
    expect(hasCliText("")).toBe(false);
    expect(hasCliText("   ")).toBe(false);
    expect(hasCliText(undefined)).toBe(false);
  });
});
