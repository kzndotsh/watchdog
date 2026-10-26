import { describe, it, expect } from "vitest";

import { fc } from "@watchdog/test-kit/fc";

import { containsPattern } from "../_ilike.ts";

/** What a LIKE pattern body means: `\x` is the literal x; a bare `%` or `_` is a wildcard. */
function literalOf(body: string): string | null {
  let out = "";
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (char === "\\") {
      const next = body[i + 1];
      if (next === undefined) return null;
      out += next;
      i += 1;
    } else if (char === "%" || char === "_") {
      return null;
    } else {
      out += char;
    }
  }
  return out;
}

describe("containsPattern", () => {
  it("wraps the trimmed term with no unescaped wildcard inside", () => {
    fc.assert(
      fc.property(fc.string(), (term) => {
        const out = containsPattern(term);
        if (out === null) {
          expect(term.trim()).toBe("");
          return;
        }
        expect(out.startsWith("%")).toBe(true);
        expect(out.endsWith("%")).toBe(true);
        expect(literalOf(out.slice(1, -1))).toBe(term.trim());
      })
    );
  });
});
