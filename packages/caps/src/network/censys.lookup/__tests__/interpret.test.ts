import { describe, it, expect } from "vitest";

import { testId } from "@watchdog/test-kit";

import { claimText, dataOf, itRejectsIncompleteReport } from "../../../testing";
import { censysLookup } from "../cap.ts";
import { interpretCensysLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    ip: "8.8.8.8",
    queriedAt: "2026-01-01T00:00:00.000Z",
    found: true,
    status: 200,
    asn: 15_169,
    asName: "GOOGLE",
    asCountryCode: "US",
    countryCode: "US",
    city: "Mountain View",
    ports: [53, 443],
    serviceNames: ["DNS", "HTTPS"],
    hostnames: ["dns.google"],
  };

  it("interpretCensysLookupReport proposes IP + hostname Identifiers + Claim", () => {
    const result = interpretCensysLookupReport(fixture, {
      input: { ip: "8.8.8.8", entityId },
    });
    expect(result.patch[0]?.kind).toBe("identifier.create");
    expect(dataOf(result.patch[0]).type).toBe("ip");
    expect(dataOf(result.patch[0]).value).toBe("8.8.8.8");
    expect(result.patch[1]?.kind).toBe("identifier.create");
    expect(dataOf(result.patch[1]).type).toBe("domain");
    expect(claimText(result, 2)).toMatch(/15169/);
    expect(claimText(result, 2)).toMatch(/HTTPS/);
  });

  it("summarizes not-indexed hosts separately from empty hits", () => {
    const result = interpretCensysLookupReport(
      {
        ...fixture,
        found: false,
        status: 404,
        asn: null,
        asName: null,
        asCountryCode: null,
        countryCode: null,
        city: null,
        ports: [],
        serviceNames: [],
        hostnames: [],
      },
      { input: { ip: fixture.ip, entityId } }
    );
    expect(claimText(result, 1)).toMatch(/not indexed/);
  });

  itRejectsIncompleteReport(censysLookup, { ip: "8.8.8.8" }, { ip: "8.8.8.8" });
});
