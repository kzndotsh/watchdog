import { describe, expect, it } from "vitest";

import {
  isJunkEmail,
  isPublicIpv4,
  normalizeLeetForEmails,
  pushId,
  stripZeroWidth,
  validBtc,
  validLtc,
} from "../harvest-helpers";

describe("harvest-helpers", () => {
  it("isJunkEmail rejects example and noreply prefixes", () => {
    expect(isJunkEmail("noreply@corp.test")).toBe(true);
    expect(isJunkEmail("alice@mailhost.test")).toBe(false);
  });

  it("stripZeroWidth removes invisible characters", () => {
    expect(stripZeroWidth("a\u200Bb")).toBe("ab");
  });

  it("normalizeLeetForEmails decodes leet outside URLs", () => {
    expect(normalizeLeetForEmails("alice[at]mailhost[dot]test")).toContain(
      "alice"
    );
  });

  it("validBtc and validLtc enforce charset diversity", () => {
    expect(validBtc("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")).toBe(true);
    expect(validBtc("1111111111111111111111111111111111")).toBe(false);
    expect(validLtc("LMabc123XYZdef456GHI789jkl012")).toBe(true);
  });

  it("isPublicIpv4 rejects loopback and RFC1918", () => {
    expect(isPublicIpv4("8.8.8.8")).toBe(true);
    expect(isPublicIpv4("127.0.0.1")).toBe(false);
    expect(isPublicIpv4("192.168.1.1")).toBe(false);
    expect(isPublicIpv4("10.0.0.1")).toBe(false);
    expect(isPublicIpv4("169.254.1.1")).toBe(false);
    expect(isPublicIpv4("100.64.0.1")).toBe(false);
  });

  it("pushId deduplicates by type platform and value", () => {
    const seen = new Set<string>();
    const list: Parameters<typeof pushId>[0] = [];
    pushId(list, seen, "email", "alice@mailhost.test", "src");
    pushId(list, seen, "email", "alice@mailhost.test", "src");
    expect(list).toHaveLength(1);
  });
});
