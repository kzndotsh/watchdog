import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { honeydbLookup } from "../cap.ts";
import { interpretHoneydbLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    ip: "1.2.3.4",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "honeydb.io" as const,
    found: true,
    asn: 4134,
    country: "China",
    isTor: false,
    isThreat: true,
    internetScanner: false,
    historyEventCount: 42,
  };

  it("interpretHoneydbLookupReport proposes observation Claim", () => {
    const result = interpretHoneydbLookupReport(fixture, {
      input: { ip: fixture.ip, entityId },
    });
    expect(result.patch.length).toBe(2);
    expect(claimText(result, 1)).toMatch(/HoneyDB/);
    expect(claimText(result, 1)).toMatch(/threat-listed/);
    expect(claimText(result, 1)).toMatch(/ASN=4134/);
  });

  it("summarizes clean indexed IPs without threat signals", () => {
    const result = interpretHoneydbLookupReport(
      {
        ...fixture,
        found: true,
        isThreat: false,
        isTor: false,
        internetScanner: false,
        historyEventCount: 0,
      },
      { input: { ip: fixture.ip, entityId } }
    );
    expect(claimText(result, 1)).toMatch(/no threat indicators/);
  });

  it("misses when HoneyDB has not indexed the IP", () => {
    const result = interpretHoneydbLookupReport(
      {
        ...fixture,
        found: false,
        isThreat: false,
        historyEventCount: 0,
      },
      { input: { ip: fixture.ip, entityId } }
    );
    expect(claimText(result, 1)).toMatch(/not indexed/);
  });

  itRejectsIncompleteReport(
    honeydbLookup,
    { ip: "1.2.3.4" },
    { ip: "1.2.3.4" }
  );
});
