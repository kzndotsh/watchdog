import { describe, expect, it } from "vitest";

import {
  claimText,
  expectNoConfidenceOnPatch,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { ipLookup } from "../cap.ts";
import { interpretIpLookupReport } from "../interpret.ts";

describe("interpretIpLookupReport", () => {
  const entityId = testId(1);

  const fixture = {
    ip: "8.8.8.8",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "team-cymru-dns" as const,
    asn: "15169",
    asns: ["15169"],
    bgpPrefix: "8.8.8.0/24",
    countryCode: "US",
    registry: "arin",
    allocated: "1992-12-01",
    asName: "GOOGLE",
    rawOrigin: "15169 | 8.8.8.0/24 | US | arin | 1992-12-01",
    rawAs: "15169 | US | arin | 1992-12-01 | GOOGLE",
  };

  it("proposes a claim with ASN and asName", () => {
    const result = interpretIpLookupReport(fixture, {
      input: { ip: "8.8.8.8", entityId },
    });
    expect(result.patch).toHaveLength(2);
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("ip");
    expect(claimText(result, 1)).toMatch(/15169/);
    expect(claimText(result, 1)).toMatch(/GOOGLE/);
    expectNoConfidenceOnPatch(result);
  });

  it("summarizes missing ASN data instead of inventing a prefix", () => {
    const result = interpretIpLookupReport(
      {
        ...fixture,
        asn: null,
        asns: [],
        bgpPrefix: null,
        countryCode: null,
        registry: null,
        asName: null,
      },
      { input: { ip: "8.8.8.8", entityId } }
    );
    expect(result.patch).toHaveLength(2);
    expect(claimText(result, 1)).toMatch(/no Cymru ASN data/);
  });

  it("lists every ASN when multiple origins are present", () => {
    const result = interpretIpLookupReport(
      {
        ...fixture,
        asns: ["15169", "64512"],
        asn: "15169",
      },
      { input: { ip: "8.8.8.8", entityId } }
    );
    expect(claimText(result, 1)).toMatch(/ASNs=15169,64512/);
  });

  it("emits an empty patch when entityId is omitted", () => {
    const result = interpretIpLookupReport(fixture, {
      input: { ip: "8.8.8.8" },
    });
    expect(result.patch).toEqual([]);
    expect(String(result.summary)).toMatch(/no Entity/i);
  });

  itRejectsIncompleteReport(ipLookup, { ip: "8.8.8.8" }, { ip: "8.8.8.8" });
});
