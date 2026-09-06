import { describe, expect, it } from "vitest";

import { asBoolean, pickDefined } from "../noun";

describe("noun helpers", () => {
  it("asBoolean accepts only boolean values", () => {
    expect(asBoolean(true)).toBe(true);
    expect(asBoolean(false)).toBe(false);
    expect(asBoolean("true")).toBeUndefined();
    expect(asBoolean(1)).toBeUndefined();
  });

  it("pickDefined drops undefined and empty strings", () => {
    expect(
      pickDefined({
        keep: "value",
        dropUndefined: undefined,
        dropEmpty: "",
        zero: 0,
      })
    ).toEqual({ keep: "value", zero: 0 });
  });
});
