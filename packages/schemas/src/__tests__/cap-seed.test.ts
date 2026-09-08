import { describe, expect, it } from "vitest";

import {
  breachQuerySeedSchema,
  dehashedQuerySeedSchema,
  emailSeedSchema,
  githubHandleSeedSchema,
  hashSeedSchema,
  hostSeedSchema,
  iocIndicatorSeedSchema,
  ipOrHostSeedSchema,
  ipSeedSchema,
  keybaseQuerySeedSchema,
  threatfoxQuerySeedSchema,
  urlhausQuerySeedSchema,
} from "../cap-seed";

describe("cap seed schemas", () => {
  it("hostSeedSchema normalizes and validates domains", () => {
    expect(hostSeedSchema.parse("  Example.COM  ")).toBe("example.com");
    expect(hostSeedSchema.parse("https://example.com/path")).toBe(
      "example.com"
    );
  });

  it("hostSeedSchema rejects invalid domains", () => {
    expect(() => hostSeedSchema.parse("not a host")).toThrow();
    expect(() => hostSeedSchema.parse("*.example.com")).toThrow();
  });

  it("ipSeedSchema normalizes and validates addresses", () => {
    expect(ipSeedSchema.parse(" 1.2.3.4 ")).toBe("1.2.3.4");
    expect(ipSeedSchema.parse("[2001:db8::1]")).toBe("2001:db8::1");
  });

  it("ipSeedSchema rejects invalid addresses", () => {
    expect(() => ipSeedSchema.parse("999.999.999.999")).toThrow();
    expect(() => ipSeedSchema.parse("not-an-ip")).toThrow();
  });

  it("emailSeedSchema normalizes emails", () => {
    expect(emailSeedSchema.parse("  Ada@Example.COM ")).toBe("ada@example.com");
    expect(() => emailSeedSchema.parse("not-an-email")).toThrow();
  });

  it("ipOrHostSeedSchema accepts IP or host seeds", () => {
    expect(ipOrHostSeedSchema.parse("1.2.3.4")).toBe("1.2.3.4");
    expect(ipOrHostSeedSchema.parse("example.com")).toBe("example.com");
    expect(() => ipOrHostSeedSchema.parse("not valid")).toThrow();
  });

  it("hashSeedSchema accepts supported hex lengths", () => {
    expect(hashSeedSchema.parse("a".repeat(32))).toHaveLength(32);
    expect(() => hashSeedSchema.parse("abc")).toThrow();
  });

  it("breachQuerySeedSchema accepts email, ip, domain, and username", () => {
    expect(breachQuerySeedSchema.parse("ada@example.com")).toBe(
      "ada@example.com"
    );
    expect(breachQuerySeedSchema.parse("1.2.3.4")).toBe("1.2.3.4");
    expect(breachQuerySeedSchema.parse("example.com")).toBe("example.com");
    expect(breachQuerySeedSchema.parse("alice")).toBe("alice");
  });

  it("dehashedQuerySeedSchema allows bounded freeform queries", () => {
    expect(dehashedQuerySeedSchema.parse("company-name")).toBe("company-name");
    expect(() => dehashedQuerySeedSchema.parse("foo OR bar")).toThrow();
  });

  it("urlhausQuerySeedSchema accepts hash, url, and host seeds", () => {
    expect(urlhausQuerySeedSchema.parse("a".repeat(32))).toHaveLength(32);
    expect(urlhausQuerySeedSchema.parse("https://evil.test/x")).toBe(
      "https://evil.test/x"
    );
    expect(urlhausQuerySeedSchema.parse("evil.test")).toBe("evil.test");
  });

  it("iocIndicatorSeedSchema accepts hash, ip, url, and domain seeds", () => {
    expect(iocIndicatorSeedSchema.parse("a".repeat(64))).toHaveLength(64);
    expect(iocIndicatorSeedSchema.parse("1.2.3.4")).toBe("1.2.3.4");
    expect(iocIndicatorSeedSchema.parse("https://evil.test")).toBe(
      "https://evil.test"
    );
    expect(iocIndicatorSeedSchema.parse("evil.test")).toBe("evil.test");
  });

  it("threatfoxQuerySeedSchema accepts ip, domain, and IOC strings", () => {
    expect(threatfoxQuerySeedSchema.parse("1.2.3.4")).toBe("1.2.3.4");
    expect(threatfoxQuerySeedSchema.parse("evil.test")).toBe("evil.test");
    expect(threatfoxQuerySeedSchema.parse("abc123def456")).toBe("abc123def456");
  });

  it("githubHandleSeedSchema normalizes handles", () => {
    expect(githubHandleSeedSchema.parse("@OctoCat")).toBe("octocat");
    expect(() => githubHandleSeedSchema.parse("bad handle")).toThrow();
  });

  it("keybaseQuerySeedSchema accepts usernames and domains", () => {
    expect(keybaseQuerySeedSchema.parse("@alice")).toBe("alice");
    expect(keybaseQuerySeedSchema.parse("example.com")).toBe("example.com");
  });
});
