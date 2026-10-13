import { describe, expect, it } from "vitest";

import { maskQuotedSpans } from "../quote-strip";

describe("maskQuotedSpans", () => {
  it("masks IPB quote body and returns quoted author", () => {
    const text =
      "My note. On 1/6/2026 at 4:11 PM, Condemned said: leak@other.test hidden";
    const { cleaned, quotedAuthor } = maskQuotedSpans(text);

    expect(quotedAuthor).toBe("Condemned");
    expect(cleaned).toContain("My note.");
    expect(cleaned).not.toContain("leak@other.test");
  });

  it("returns original text when no quote headers", () => {
    const text = "plain post body";
    const { cleaned, quotedAuthor } = maskQuotedSpans(text);
    expect(cleaned).toBe(text);
    expect(quotedAuthor).toBeNull();
  });
});

describe("maskQuotedSpans pathological input", () => {
  const BOUND_MS = 500;
  const timed = (text: string): number => {
    const start = performance.now();
    maskQuotedSpans(text);
    return performance.now() - start;
  };

  it("still masks a relative-time header after a long digit run", () => {
    const text = `x ${"0".repeat(10)} 5 hours ago, Ada said: secret\n\nafter`;
    const { cleaned, quotedAuthor } = maskQuotedSpans(text);
    expect(quotedAuthor).toBe("Ada");
    expect(cleaned).not.toContain("secret");
    expect(cleaned).toContain("after");
  });

  it("matches the header from the first digit of a multi-digit count", () => {
    const { cleaned } = maskQuotedSpans("see 125 hours ago, Ada said: secret");
    expect(cleaned.startsWith("see ")).toBe(true);
    expect(cleaned).not.toContain("secret");
  });

  it("stays linear on a long run of digits with no header", () => {
    expect(timed("0".repeat(100_000))).toBeLessThan(BOUND_MS);
  });

  it("stays linear on digits and spaces with no header", () => {
    expect(timed("0 ".repeat(50_000))).toBeLessThan(BOUND_MS);
  });
});
