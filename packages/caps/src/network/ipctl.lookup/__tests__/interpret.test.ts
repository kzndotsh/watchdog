import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import {
  claimText,
  expectProposesIdentifier,
  itRejectsIncompleteReport,
} from "../../../testing";
import { ipctlLookup } from "../cap.ts";
import { interpretIpctlLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    ip: "8.8.8.8",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "api.ipctl.io" as const,
    asn: 15_169,
    asName: "GOOGLE - Google LLC",
    bgpPrefix: "8.8.8.0/24",
    rirCountryCode: "US",
    rir: "ARIN",
    rpkiStatus: "valid",
    reverseDns: "dns.google",
    isAnycast: true,
    isBogon: false,
    geoCountryCode: "US",
    geoCity: "Mountain View",
    geoRegion: "California",
    geoCountryName: "United States",
    threatScore: 0,
    tags: ["anycast"],
  };

  it("proposes ip + PTR domain and Claim with reverseDns", () => {
    const result = interpretIpctlLookupReport(fixture, {
      input: { ip: "8.8.8.8", entityId },
    });
    expectProposesIdentifier(result, { type: "ip", value: "8.8.8.8" });
    expectProposesIdentifier(result, { type: "domain", value: "dns.google" });
    expect(claimText(result, 2)).toMatch(/ASN=15169/);
    expect(claimText(result, 2)).toMatch(/PTR=dns\.google/);
    expect(claimText(result, 2)).toMatch(/GeoIP≈/);
  });

  it("miss / empty PTR still lands seed ip", () => {
    const result = interpretIpctlLookupReport(
      { ...fixture, reverseDns: null, asn: null, asName: null, tags: [] },
      { input: { ip: fixture.ip, entityId } }
    );
    expectProposesIdentifier(result, { type: "ip", value: "8.8.8.8" });
    const domains = result.patch.filter(
      (p) => p.resource === "identifier" && p.data.type === "domain"
    );
    expect(domains).toHaveLength(0);
  });

  itRejectsIncompleteReport(ipctlLookup, { ip: "8.8.8.8" }, { ip: "8.8.8.8" });
});
