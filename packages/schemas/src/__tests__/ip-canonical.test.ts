import { describe, it, expect } from "vitest";

import { compressIpv6, expandIpv6 } from "../ip-canonical.ts";

describe("ip-canonical", () => {
  it("expandIpv6 fills :: gaps", () => {
    expect(expandIpv6("2001:db8::1")).toBe(
      "2001:0db8:0000:0000:0000:0000:0000:0001"
    );
  });

  it("compressIpv6 round-trips expanded spellings", () => {
    expect(compressIpv6("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe(
      "2001:db8::1"
    );
    expect(compressIpv6("2001:db8::1")).toBe("2001:db8::1");
    expect(compressIpv6("::1")).toBe("::1");
  });

  it("rejects a malformed address", () => {
    expect(() => expandIpv6("1::2::3")).toThrow(/Invalid IPv6/);
  });
});
