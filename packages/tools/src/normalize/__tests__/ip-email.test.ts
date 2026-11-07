import { describe, expect, it } from "vitest";

import { normalizeIdentifierValue } from "@watchdog/schemas/graph";

import { normalizeEmail } from "../email.ts";
import { normalizeIp } from "../ip.ts";

describe("normalizeIp", () => {
  it("accepts IPv4 and rejects junk", () => {
    expect(normalizeIp(" 8.8.8.8 ")).toBe("8.8.8.8");
    expect(() => normalizeIp("not-an-ip")).toThrow(/Invalid IP/);
  });

  it("canonicalizes equivalent IPv6 spellings", () => {
    expect(normalizeIp("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe(
      "2001:db8::1"
    );
    expect(normalizeIp("2001:db8::1")).toBe("2001:db8::1");
  });

  it("agrees with a hand-typed ip Identifier's normalized form", () => {
    const spellings: [cap: string, typed: string][] = [
      ["2001:DB8::1", "2001:DB8::1"],
      [
        "2001:0db8:0000:0000:0000:0000:0000:0001",
        "2001:0db8:0000:0000:0000:0000:0000:0001",
      ],
      ["2001:db8::1", "[2001:db8::1]"],
      ["::ffff:192.0.2.1", "::ffff:192.0.2.1"],
      ["::", "::"],
      ["fe80::", "FE80:0:0:0:0:0:0:0"],
      ["8.8.8.8", " 8.8.8.8 "],
    ];
    for (const [cap, typed] of spellings) {
      expect(normalizeIp(cap)).toBe(normalizeIdentifierValue("ip", typed));
    }
  });
});

describe("normalizeEmail", () => {
  it("lowercases and validates shape", () => {
    expect(normalizeEmail(" Alice@MailHost.Test ")).toEqual({
      email: "alice@mailhost.test",
      domain: "mailhost.test",
    });
    expect(() => normalizeEmail("not-an-email")).toThrow(/Invalid email/);
  });
});
