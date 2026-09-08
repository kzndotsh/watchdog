import { describe, expect, it } from "vitest";

import { parseExitAddresses, torExitIpKey } from "../tor-exit";

describe("tor-exit", () => {
  it("parseExitAddresses extracts normalized exit IPs", () => {
    const text = [
      "Published 2026-01-01 00:00:00",
      "ExitAddress 1.2.3.4 2026-01-01 00:00:00",
      "ExitAddress 5.6.7.8 2026-01-01 00:00:00",
    ].join("\n");
    const ips = parseExitAddresses(text);
    expect(ips.has("1.2.3.4")).toBe(true);
    expect(ips.has("5.6.7.8")).toBe(true);
  });

  it("torExitIpKey canonicalizes equivalent IPv6 spellings", () => {
    const expanded = "2001:0db8:0000:0000:0000:0000:0000:0001";
    const compressed = "2001:db8::1";
    expect(torExitIpKey(expanded)).toBe(torExitIpKey(compressed));
    const text = `ExitAddress ${expanded} 2026-01-01 00:00:00\n`;
    const ips = parseExitAddresses(text);
    expect(ips.has(torExitIpKey(compressed)!)).toBe(true);
  });
});
