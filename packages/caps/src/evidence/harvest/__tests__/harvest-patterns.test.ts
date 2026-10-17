import { beforeEach, describe, expect, it } from "vitest";

import * as P from "../harvest-patterns";

describe("harvest-patterns", () => {
  // The exported patterns are global (`/g`), so `exec` keeps `lastIndex` between calls:
  // reset it so a repeat or a reordered test starts from the beginning of the input.
  beforeEach(() => {
    P.EMAIL_RE.lastIndex = 0;
    P.TELEGRAM_RE.lastIndex = 0;
    P.PAYMENT_HANDLE_RE.lastIndex = 0;
  });

  it("EMAIL_RE matches standard addresses", () => {
    const m = P.EMAIL_RE.exec("reach alice@mailhost.test today");
    expect(m?.[0]).toBe("alice@mailhost.test");
  });

  it("TELEGRAM_RE matches t.me usernames", () => {
    const m = P.TELEGRAM_RE.exec("see t.me/alphatest12345");
    expect(m?.[1]).toBe("alphatest12345");
  });

  it("isNegatedOrConditionalPrefix detects negated self-disclosure", () => {
    expect(P.isNegatedOrConditionalPrefix("I did not ")).toBe(true);
    expect(P.isNegatedOrConditionalPrefix("contact me at ")).toBe(false);
  });

  it("PAYMENT_HANDLE_RE matches anchored payment handles", () => {
    const m = P.PAYMENT_HANDLE_RE.exec("my paypal is @donor123");
    expect(m?.[1]).toBe("donor123");
  });
});
