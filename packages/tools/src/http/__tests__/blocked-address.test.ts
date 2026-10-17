import { describe, expect, it } from "vitest";

import { isBlockedAddress, isBlockedHostName } from "../blocked-address";

describe("isBlockedAddress", () => {
  it.each([
    ["0.0.0.0", "unspecified"],
    ["0.1.2.3", "this network"],
    ["10.0.0.1", "private"],
    ["10.255.255.255", "private"],
    ["100.64.0.1", "carrier-grade NAT"],
    ["100.127.255.255", "carrier-grade NAT"],
    ["127.0.0.1", "loopback"],
    ["127.255.255.254", "loopback"],
    ["169.254.169.254", "cloud metadata"],
    ["169.254.0.1", "link-local"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["192.0.0.1", "protocol assignments"],
    ["192.0.2.1", "documentation"],
    ["192.168.1.1", "private"],
    ["198.18.0.1", "benchmarking"],
    ["198.51.100.7", "documentation"],
    ["203.0.113.9", "documentation"],
    ["224.0.0.1", "multicast"],
    ["239.255.255.255", "multicast"],
    ["240.0.0.1", "reserved"],
    ["255.255.255.255", "broadcast"],
  ])("refuses IPv4 %s (%s)", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "100.63.255.255",
    "100.128.0.1",
    "172.15.0.1",
    "172.32.0.1",
    "93.184.216.34",
  ])("allows public IPv4 %s", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it.each([
    ["::", "unspecified"],
    ["::1", "loopback"],
    ["0:0:0:0:0:0:0:1", "loopback, long form"],
    ["fe80::1", "link-local"],
    ["febf::1", "link-local"],
    ["fec0::1", "site-local"],
    ["fc00::1", "unique-local"],
    ["fd12:3456::1", "unique-local"],
    ["ff02::1", "multicast"],
    ["2001:db8::1", "documentation"],
    ["2001::1", "Teredo"],
    ["100::1", "discard-only"],
    ["::ffff:127.0.0.1", "mapped loopback"],
    ["::ffff:7f00:1", "mapped loopback, hex form"],
    ["0:0:0:0:0:ffff:a00:1", "mapped private, long form"],
    ["::ffff:169.254.169.254", "mapped metadata"],
    ["::ffff:10.0.0.1", "mapped private"],
    ["::127.0.0.1", "IPv4-compatible loopback"],
    ["::10.0.0.1", "IPv4-compatible private"],
    ["64:ff9b::7f00:1", "NAT64 loopback"],
    ["64:ff9b::a9fe:a9fe", "NAT64 metadata"],
    ["2002:7f00:1::1", "6to4 loopback"],
    ["2002:0a00:0001::", "6to4 private"],
    ["fe80::1%eth0", "link-local with zone"],
  ])("refuses IPv6 %s (%s)", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
    "::ffff:8.8.8.8",
    "64:ff9b::808:808",
    "2002:808:808::1",
  ])("allows public IPv6 %s", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it("accepts a bracketed literal as a URL host spells it", () => {
    expect(isBlockedAddress("[::1]")).toBe(true);
    expect(isBlockedAddress("[2606:4700:4700::1111]")).toBe(false);
  });

  it.each([
    "",
    "example.com",
    "999.1.1.1",
    "1.2.3",
    "::g",
    "1:2:3:4:5:6:7:8:9",
  ])("refuses text that is not an address: %j", (text) => {
    expect(isBlockedAddress(text)).toBe(true);
  });
});

describe("isBlockedHostName", () => {
  it("refuses localhost and its subdomains, with or without a trailing dot", () => {
    expect(isBlockedHostName("localhost")).toBe(true);
    expect(isBlockedHostName("LOCALHOST.")).toBe(true);
    expect(isBlockedHostName("api.localhost")).toBe(true);
    expect(isBlockedHostName("localhost.example.com")).toBe(false);
    expect(isBlockedHostName("example.com")).toBe(false);
  });
});
