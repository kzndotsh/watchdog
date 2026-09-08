import { describe, expect, it } from "vitest";

import {
  claimText,
  expectProposesIdentifier,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { ipinfoLookup } from "../cap.ts";
import { interpretIpinfoLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    ip: "8.8.8.8",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "ipinfo.io" as const,
    found: true,
    hostname: "dns.google",
    city: "Mountain View",
    region: "California",
    country: "US",
    loc: "37.4056,-122.0775",
    org: "AS15169 Google LLC",
    postal: "94043",
    timezone: "America/Los_Angeles",
  };

  it("proposes ip + hostname domain with geo/org Claim", () => {
    const result = interpretIpinfoLookupReport(fixture, {
      input: { ip: fixture.ip, entityId },
    });
    expectProposesIdentifier(result, { type: "ip", value: "8.8.8.8" });
    expectProposesIdentifier(result, { type: "domain", value: "dns.google" });
    expect(claimText(result, 2)).toMatch(/IPinfo/);
    expect(claimText(result, 2)).toMatch(/Mountain View/);
    expect(claimText(result, 2)).toMatch(/Google LLC/);
  });

  it("empty patch without entityId", () => {
    const result = interpretIpinfoLookupReport(fixture, {
      input: { ip: fixture.ip },
    });
    expect(result.patch).toEqual([]);
  });

  it("miss still lands seed ip, not hostname", () => {
    const result = interpretIpinfoLookupReport(
      { ...fixture, found: false, hostname: "dns.google" },
      { input: { ip: fixture.ip, entityId } }
    );
    expectProposesIdentifier(result, { type: "ip", value: "8.8.8.8" });
    const domains = result.patch.filter(
      (p) => p.resource === "identifier" && p.data.type === "domain"
    );
    expect(domains).toHaveLength(0);
    expect(claimText(result, 1)).toMatch(/bogon\/reserved/);
  });

  it("found without hostname proposes ip only", () => {
    const result = interpretIpinfoLookupReport(
      { ...fixture, hostname: null },
      { input: { ip: fixture.ip, entityId } }
    );
    expectProposesIdentifier(result, { type: "ip", value: "8.8.8.8" });
    const domains = result.patch.filter(
      (p) => p.resource === "identifier" && p.data.type === "domain"
    );
    expect(domains).toHaveLength(0);
  });

  itRejectsIncompleteReport(ipinfoLookup, { ip: "8.8.8.8" }, { ip: "8.8.8.8" });
});
