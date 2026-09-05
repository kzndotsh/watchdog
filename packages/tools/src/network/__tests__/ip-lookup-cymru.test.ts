import { describe, expect, it } from "vitest";

import {
  expandIpv6,
  originLookupName,
  parseCymruAsName,
  parseCymruOriginTxt,
  stripTxtQuotes,
} from "../ip-lookup-cymru";

describe("ip-lookup-cymru", () => {
  it("originLookupName reverses IPv4 octets", () => {
    expect(originLookupName("8.8.8.8")).toBe("8.8.8.8.origin.asn.cymru.com");
  });

  it("expandIpv6 fills :: gaps", () => {
    expect(expandIpv6("2001:db8::1")).toBe(
      "2001:0db8:0000:0000:0000:0000:0000:0001"
    );
  });

  it("parses Team Cymru origin and AS TXT rows", () => {
    expect(
      stripTxtQuotes('"15169 | 8.8.8.0/24 | US | arin | 2000-03-30"')
    ).toBe("15169 | 8.8.8.0/24 | US | arin | 2000-03-30");
    expect(
      parseCymruOriginTxt("15169 | 8.8.8.0/24 | US | arin | 2000-03-30")
    ).toEqual({
      asns: ["15169"],
      bgpPrefix: "8.8.8.0/24",
      countryCode: "US",
      registry: "arin",
      allocated: "2000-03-30",
    });
    expect(
      parseCymruAsName("15169 | US | arin | 2000-03-30 | GOOGLE - Google LLC")
    ).toBe("GOOGLE - Google LLC");
  });
});
