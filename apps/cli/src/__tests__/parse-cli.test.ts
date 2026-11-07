import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  parseCliEnum,
  parseOptionalCliEnum,
  parseOptionalNullableTrimmedPatch,
} from "../parse-cli";
import { failureOf } from "./stand-in-api";

// A developer `.env` above the checkout would otherwise be loaded into process.env.
vi.mock("dotenv", () => ({ config: vi.fn() }));

const tierSchema = z.enum(["unverified", "possible", "confirmed"]);

describe("parseCliEnum", () => {
  it("parses valid enum values", () => {
    expect(parseCliEnum(tierSchema, "  unverified  ", "confidence")).toBe(
      "unverified"
    );
  });

  it("fails USAGE naming the field for invalid enum values", async () => {
    const failure = await failureOf(() =>
      parseCliEnum(tierSchema, "bogus", "confidence")
    );
    expect(failure.exitCode).toBe(1);
    expect(failure.error.code).toBe("USAGE");
    expect(failure.error.message).toContain("confidence");
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
