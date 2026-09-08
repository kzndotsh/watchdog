import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { dshieldLookup } from "../cap.ts";
import { interpretDshieldLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const foundFixture = {
    ip: "1.2.3.4",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "isc.sans.edu" as const,
    found: true,
    attacks: 34,
    count: 9843,
    maxrisk: "1",
    asname: "CHINANET-BACKBONE",
    network: "1.80.0.0/13",
    asn: 4134,
    asCountry: "CN",
    firstSeen: "2020-01-01",
    lastSeen: "2026-01-01",
    threatFeedCount: 2,
  };

  const notFoundFixture = {
    ip: "1.2.3.4",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "isc.sans.edu" as const,
    found: false,
    attacks: null,
    count: null,
    maxrisk: null,
    asname: null,
    network: null,
    asn: null,
    asCountry: null,
    firstSeen: null,
    lastSeen: null,
    threatFeedCount: null,
  };

  it("interpretDshieldLookupReport proposes observation Claim with attack counts", () => {
    const result = interpretDshieldLookupReport(foundFixture, {
      input: { ip: foundFixture.ip, entityId },
    });
    expect(result.patch.length).toBe(2);
    expect(claimText(result, 1)).toMatch(/attacks=34/);
    expect(claimText(result, 1)).toMatch(/CHINANET-BACKBONE/);
  });

  it("interpretDshieldLookupReport reports no sightings softly", () => {
    const result = interpretDshieldLookupReport(notFoundFixture, {
      input: { ip: notFoundFixture.ip, entityId },
    });
    expect(claimText(result, 1)).toMatch(/no honeypot sightings/);
  });

  itRejectsIncompleteReport(
    dshieldLookup,
    { ip: "1.2.3.4" },
    { ip: "1.2.3.4" }
  );
});
