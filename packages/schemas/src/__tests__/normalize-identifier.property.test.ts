import { describe, it, expect } from "vitest";

import { fc } from "@watchdog/test-kit/fc";

import { normalizeIdentifierValue } from "../normalize-identifier.ts";
import { IDENTIFIER_TYPES } from "../vocab.ts";

describe("normalizeIdentifierValue", () => {
  it("returns the same value on a second normalize", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...IDENTIFIER_TYPES),
        fc.string(),
        (type, value) => {
          const once = normalizeIdentifierValue(type, value);
          expect(normalizeIdentifierValue(type, once)).toBe(once);
        }
      )
    );
  });

  it("strips utm and fbclid params from url results", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 0xf_ff_ff_ff }).map((n) => n.toString(16)),
        (token) => {
          const out = normalizeIdentifierValue(
            "url",
            `https://Example.com/path?utm_source=${token}&utm_medium=${token}&fbclid=${token}&keep=1`
          );
          expect(out.includes("utm_")).toBe(false);
          expect(out.includes("fbclid")).toBe(false);
          expect(out.includes("keep=1")).toBe(true);
        }
      )
    );
  });
});

describe("normalizeIdentifierValue ip idempotence regressions", () => {
  it.each([
    ["; ]", ";"],
    ["[[::1]]", "::1"],
    ["[ [1.2.3.4] ]", "1.2.3.4"],
    ["  [ ::1 ]  ", "::1"],
  ])("normalizes %j to a fixed point", (input, expected) => {
    const once = normalizeIdentifierValue("ip", input);
    expect(once).toBe(expected);
    expect(normalizeIdentifierValue("ip", once)).toBe(once);
  });
});

describe("normalizeIdentifierValue other idempotence regressions", () => {
  it("domain '! .' reaches a fixed point", () => {
    const once = normalizeIdentifierValue("domain", "! .");
    expect(normalizeIdentifierValue("domain", once)).toBe(once);
  });
});
