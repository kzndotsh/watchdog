import { describe, it, expect } from "vitest";

import { compressIpv6, expandIpv6 } from "../ip.ts";

describe("ip", () => {
  it("expandIpv6 fills :: gaps", () => {
    expect(expandIpv6("2001:db8::1")).toBe(
      "2001:0db8:0000:0000:0000:0000:0000:0001"
    );
  });

  it("expandIpv6 turns an embedded dotted IPv4 tail into its two hextets", () => {
    expect(expandIpv6("::ffff:192.0.2.1")).toBe(
      "0000:0000:0000:0000:0000:ffff:c000:0201"
    );
    expect(expandIpv6("1:2:3:4:5:6:192.0.2.1")).toBe(
      "0001:0002:0003:0004:0005:0006:c000:0201"
    );
  });

  it("compressIpv6 round-trips expanded spellings", () => {
    expect(compressIpv6("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe(
      "2001:db8::1"
    );
    expect(compressIpv6("2001:db8::1")).toBe("2001:db8::1");
    expect(compressIpv6("::1")).toBe("::1");
  });

  it("writes an IPv4-mapped address with its dotted tail (RFC 5952 §5), whatever the spelling", () => {
    for (const spelling of [
      "::ffff:192.0.2.1",
      "::FFFF:c000:201",
      "0:0:0:0:0:ffff:192.0.2.1",
    ]) {
      expect(compressIpv6(spelling), spelling).toBe("::ffff:192.0.2.1");
    }
  });

  it("writes a dotted tail outside the mapped prefix as hextets", () => {
    expect(compressIpv6("1:2:3:4:5:6:192.0.2.1")).toBe("1:2:3:4:5:6:c000:201");
  });

  it.each([
    "1::2::3",
    "gggg::1",
    "12345::1",
    "1:2:3:4:5:6:7:8:9",
    "1:2:3:4:5:6:7",
    "1:2:3:4:5:6:7::8",
    "::1.2.3",
    "::1.2.3.256",
    "1.2.3.4::1",
    "",
  ])("rejects malformed %j", (input) => {
    expect(() => expandIpv6(input)).toThrow(/Invalid IPv6/);
  });
});
