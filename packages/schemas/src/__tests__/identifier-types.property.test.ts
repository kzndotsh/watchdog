import { describe, it, expect } from "vitest";

import { fc } from "@watchdog/test-kit/fc";

import { IDENTIFIER_TYPE_TABLE } from "../identifier-types.ts";
import { normalizeIdentifierValue } from "../normalize-identifier.ts";
import { validateIdentifierValue } from "../validate-identifier.ts";
import { IDENTIFIER_TYPES } from "../vocab.ts";

const hex = fc.constantFrom(..."0123456789abcdefABCDEF");
const label = fc.stringMatching(
  /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,10}[a-zA-Z0-9])?$/
);

/** Strings near the IP grammar, so the recogniser's accepts and rejects both get exercised. */
const ipish = fc.oneof(
  fc.ipV4(),
  fc.ipV6(),
  fc.array(hex, { minLength: 1, maxLength: 4 }).chain((first) =>
    fc.array(fc.array(hex, { maxLength: 5 }), { maxLength: 9 }).map((rest) => {
      return [first, ...rest].map((g) => g.join("")).join(":");
    })
  ),
  fc.stringMatching(/^[0-9a-fA-F:.]{0,30}$/),
  fc.constantFrom("::", "::1", "1::", ":::", "1:2:3", "::ffff:192.0.2.1")
);

const domainish = fc.oneof(
  fc.domain(),
  fc
    .tuple(fc.array(label, { minLength: 1, maxLength: 4 }), fc.string())
    .map(([labels, tld]) => `${labels.join(".")}.${tld}`),
  fc.string()
);

const phoneish = fc.oneof(
  fc.stringMatching(/^\+?[\d\s()./-]{0,20}$/),
  fc.string(),
  fc.integer({ min: 0, max: 9_999_999_999_999 }).map(String)
);

const emailish = fc.oneof(
  fc.emailAddress(),
  fc.string(),
  fc.tuple(fc.string(), fc.string()).map(([a, b]) => `${a}@${b}`)
);

function recognised(
  type: "ip" | "email" | "domain" | "phone",
  raw: string
): boolean {
  return IDENTIFIER_TYPE_TABLE[type].recognise?.(raw) ?? false;
}

describe("Identifier type table recognisers", () => {
  for (const [type, arbitrary] of [
    ["ip", ipish],
    ["email", emailish],
    ["domain", domainish],
    ["phone", phoneish],
  ] as const) {
    it(`${type}: whatever is recognised canonicalizes to a valid value`, () => {
      fc.assert(
        fc.property(arbitrary, (raw) => {
          if (!recognised(type, raw)) return;
          const result = validateIdentifierValue(type, raw);
          expect(result).toEqual({
            ok: true,
            value: normalizeIdentifierValue(type, raw),
          });
        }),
        { numRuns: 500 }
      );
    });
  }

  it("every generated email address is recognised", () => {
    fc.assert(
      fc.property(fc.emailAddress(), (email) => {
        expect(recognised("email", email)).toBe(true);
      })
    );
  });

  it("every generated domain is recognised, underscore labels included", () => {
    fc.assert(
      fc.property(fc.domain(), (domain) => {
        expect(recognised("domain", domain)).toBe(true);
      })
    );
    expect(recognised("domain", "_dmarc.example.com")).toBe(true);
  });

  it("rejects plainly malformed emails and domains", () => {
    for (const raw of ["a@b", "a@.b.co", "a@b..co", "@b.co"]) {
      expect(recognised("email", raw), raw).toBe(false);
    }
    for (const raw of ["localhost", "a..co", "-a.co", "a.co/x"]) {
      expect(recognised("domain", raw), raw).toBe(false);
    }
  });

  it("every generated IP address is recognised", () => {
    fc.assert(
      fc.property(fc.oneof(fc.ipV4(), fc.ipV6()), (ip) => {
        expect(recognised("ip", ip)).toBe(true);
      })
    );
  });

  it("recognises phones by length and separators, not bare short numbers", () => {
    for (const raw of ["+1 555 123 4567", "(555) 123-4567", "5551234567"]) {
      expect(recognised("phone", raw), raw).toBe(true);
    }
    for (const raw of [
      "1234567",
      "12345678",
      "+1",
      "abc",
      "tel:+15551234567",
    ]) {
      expect(recognised("phone", raw), raw).toBe(false);
    }
  });

  it("an IP is not an email or a domain", () => {
    fc.assert(
      fc.property(fc.oneof(fc.ipV4(), fc.ipV6()), (ip) => {
        expect(recognised("email", ip)).toBe(false);
        expect(recognised("domain", ip)).toBe(false);
      })
    );
  });

  it("has an entry for every Identifier type", () => {
    expect(Object.keys(IDENTIFIER_TYPE_TABLE).sort()).toEqual(
      [...IDENTIFIER_TYPES].sort()
    );
  });
});

describe("Identifier recognisers on adversarial input", () => {
  it("rejects a long run of dots in an email's domain without backtracking", () => {
    const recognise = IDENTIFIER_TYPE_TABLE.email.recognise;
    const input = `!@!.${"!.".repeat(50_000)}\n`;
    const started = performance.now();
    expect(recognise?.(input)).toBe(false);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
