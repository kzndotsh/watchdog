import { describe, it, expect } from "vitest";

import { fc } from "#test-kit/fc";

import { normalizeIdentifierValue } from "../normalize-identifier.ts";
import { validateIdentifierValue } from "../validate-identifier.ts";
import { IDENTIFIER_TYPES } from "../vocab.ts";

describe("validateIdentifierValue", () => {
  it("lowercases passing emails to the normalized value", () => {
    fc.assert(
      fc.property(fc.emailAddress(), (email) => {
        const result = validateIdentifierValue("email", email);
        if (!result.ok) return;
        expect(result.value).toBe(result.value.toLowerCase());
        expect(result.value).toBe(normalizeIdentifierValue("email", email));
      })
    );
  });

  it("rejects empty and whitespace for every identifier type", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...IDENTIFIER_TYPES),
        fc.constantFrom("", " ", "  ", "\t", "\n", " \t\n"),
        (type, value) => {
          expect(validateIdentifierValue(type, value).ok).toBe(false);
        }
      )
    );
  });
});
