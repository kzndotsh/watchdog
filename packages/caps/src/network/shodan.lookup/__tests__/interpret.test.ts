import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { shodanLookup } from "../cap.ts";
import { interpretShodanLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    ip: "8.8.8.8",
    queriedAt: "2026-01-01T00:00:00.000Z",
    found: true,
    status: 200,
    org: "Google LLC",
    isp: "Google LLC",
    asn: "AS15169",
    hostnames: ["dns.google"],
    ports: [53, 443],
    tags: [],
    os: null,
    countryCode: "US",
    city: "Mountain View",
    lastUpdate: "2026-01-01T00:00:00.000Z",
  };

  it("interpretShodanLookupReport proposes IP + domain Identifier + Claim", () => {
    const result = interpretShodanLookupReport(fixture, {
      input: { ip: "8.8.8.8", entityId },
    });
    expect(result.patch.length).toBe(3);
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("ip");
    expect(result.patch[0]?.data.value).toBe("8.8.8.8");
    expect(result.patch[1]?.resource).toBe("identifier");
    expect(result.patch[1]?.data.type).toBe("domain");
    expect(result.patch[1]?.data.value).toBe("dns.google");
    expect(result.patch[2]?.resource).toBe("claim");
    expect(claimText(result, 2)).toMatch(/Google LLC/);
    expect(claimText(result, 2)).toMatch(/53/);
  });

  it("notes hostname truncation when the report exceeds the batch limit", () => {
    const hostnames = Array.from(
      { length: 81 },
      (_, index) => `host-${index}.example`
    );
    const result = interpretShodanLookupReport(
      { ...fixture, hostnames },
      { input: { ip: "8.8.8.8", entityId } }
    );
    expect(String(result.summary)).toMatch(/showing 80 of 81/);
  });

  it("summarizes not-indexed hosts separately from empty hits", () => {
    const result = interpretShodanLookupReport(
      {
        ...fixture,
        found: false,
        status: 404,
        org: null,
        isp: null,
        asn: null,
        hostnames: [],
        ports: [],
        tags: [],
        os: null,
        countryCode: null,
        city: null,
        lastUpdate: null,
      },
      { input: { ip: fixture.ip, entityId } }
    );
    expect(claimText(result, 1)).toMatch(/not indexed/);
  });

  itRejectsIncompleteReport(shodanLookup, { ip: "8.8.8.8" }, { ip: "8.8.8.8" });
});
