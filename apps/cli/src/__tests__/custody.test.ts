import { describe, expect, it, vi } from "vitest";

import {
  refuseConfirmed,
  requireUserOverride,
  parseOptionalConfidence,
} from "../custody";

vi.mock("../io", () => ({
  fail: vi.fn((code: string, message: string) => {
    throw new Error(`${code}: ${message}`);
  }),
}));

describe("custody helpers", () => {
  it("requireUserOverride throws when override is disabled", () => {
    expect(() => {
      requireUserOverride(false);
    }).toThrow(/CUSTODY/);
  });

  it("refuseConfirmed throws for confirmed confidence", () => {
    expect(() => {
      refuseConfirmed("confirmed");
    }).toThrow(/CUSTODY/);
  });

  it("parseOptionalConfidence returns undefined for omitted values", () => {
    expect(parseOptionalConfidence(undefined)).toBeUndefined();
    expect(parseOptionalConfidence("")).toBeUndefined();
    expect(parseOptionalConfidence("   ")).toBeUndefined();
  });

  it("parseOptionalConfidence parses provided tiers", () => {
    expect(parseOptionalConfidence("unverified")).toBe("unverified");
  });

  it("parseOptionalConfidence rejects invalid tiers", () => {
    expect(() => {
      parseOptionalConfidence("bogus");
    }).toThrow(/USAGE/);
  });
});
