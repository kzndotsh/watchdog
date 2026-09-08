import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  parseCliEnum,
  parseOptionalCliEnum,
  parseOptionalNullableTrimmedPatch,
} from "../parse-cli";

vi.mock("../io", () => ({
  fail: vi.fn((code: string, message: string) => {
    throw new Error(`${code}: ${message}`);
  }),
}));

const tierSchema = z.enum(["unverified", "possible", "confirmed"]);

describe("parseCliEnum", () => {
  it("parses valid enum values", () => {
    expect(parseCliEnum(tierSchema, "  unverified  ", "confidence")).toBe(
      "unverified"
    );
  });

  it("throws USAGE for invalid enum values", () => {
    expect(() => parseCliEnum(tierSchema, "bogus", "confidence")).toThrow(
      /USAGE/
    );
  });
});

describe("parseOptionalCliEnum", () => {
  it("returns undefined for omitted or blank values", () => {
    expect(
      parseOptionalCliEnum(tierSchema, undefined, "confidence")
    ).toBeUndefined();
    expect(
      parseOptionalCliEnum(tierSchema, "   ", "confidence")
    ).toBeUndefined();
  });

  it("parses provided values", () => {
    expect(parseOptionalCliEnum(tierSchema, "possible", "confidence")).toBe(
      "possible"
    );
  });
});

describe("parseOptionalNullableTrimmedPatch", () => {
  it("returns undefined when omitted", () => {
    expect(parseOptionalNullableTrimmedPatch(undefined)).toBeUndefined();
  });

  it("clears blank values and trims non-blank values", () => {
    expect(parseOptionalNullableTrimmedPatch("   ")).toBeNull();
    expect(parseOptionalNullableTrimmedPatch("  hello  ")).toBe("hello");
  });
});
