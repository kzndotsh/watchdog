import { describe, expect, it } from "vitest";

import { hostSeedSchema, ipSeedSchema } from "../cap-seed";

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
});
