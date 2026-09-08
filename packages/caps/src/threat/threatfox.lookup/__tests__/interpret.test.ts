import { describe, it, expect } from "vitest";

import {
  claimText,
  expectProposesIdentifier,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { threatfoxLookup } from "../cap.ts";
import { interpretThreatfoxLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    query: "1.2.3.4",
    kind: "ip" as const,
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "threatfox-api.abuse.ch" as const,
    queryStatus: "ok",
    found: true,
    iocs: [
      {
        id: "1",
        ioc: "1.2.3.4",
        iocType: "ip:port",
        threatType: "botnet_cc",
        malware: "win.emotet",
        malwarePrintable: "Emotet",
        confidenceLevel: 90,
        firstSeen: "2026-01-01 00:00:00",
        lastSeen: null,
        tags: ["emotet"],
      },
    ],
  };

  it("interpretThreatfoxLookupReport proposes typed IOC Identifiers + Claim", () => {
    const result = interpretThreatfoxLookupReport(fixture, {
      input: { query: "1.2.3.4", entityId },
    });
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("ip");
    expect(result.patch[0]?.data.value).toBe("1.2.3.4");
    expect(claimText(result, 1)).toMatch(/abuse\.ch/);
    expect(claimText(result, 1)).toMatch(/Emotet/);
  });

  itRejectsIncompleteReport(
    threatfoxLookup,
    { query: "1.2.3.4" },
    { query: "1.2.3.4" }
  );

  it("proposes the queried IP when no IOC hits are returned", () => {
    const result = interpretThreatfoxLookupReport(
      { ...fixture, found: true, iocs: [] },
      { input: { query: "1.2.3.4", entityId } }
    );
    expectProposesIdentifier(result, { type: "ip", value: "1.2.3.4" });
    expect(result.patch.filter((p) => p.resource === "claim")).toHaveLength(1);
    expect(claimText(result, 1)).toMatch(/0 IOC\(s\)/);
    expect(claimText(result, 1)).not.toMatch(/no IOC hits/);
  });

  it("summarizes no_result lookups separately from clean ok responses", () => {
    const result = interpretThreatfoxLookupReport(
      {
        ...fixture,
        queryStatus: "no_result",
        found: false,
        iocs: [],
      },
      { input: { query: "1.2.3.4", entityId } }
    );
    expect(claimText(result, 1)).toMatch(/no IOC hits/);
  });

  it("drops wildcard domain IOCs", () => {
    const result = interpretThreatfoxLookupReport(
      {
        ...fixture,
        iocs: [
          {
            id: "2",
            ioc: "*.evil.example",
            iocType: "domain",
            threatType: "botnet_cc",
            malware: "win.test",
            malwarePrintable: "Test",
            confidenceLevel: 50,
            firstSeen: null,
            lastSeen: null,
            tags: [],
          },
          {
            id: "3",
            ioc: "cdn.evil.example",
            iocType: "domain",
            threatType: "botnet_cc",
            malware: "win.test",
            malwarePrintable: "Test",
            confidenceLevel: 50,
            firstSeen: null,
            lastSeen: null,
            tags: [],
          },
        ],
      },
      { input: { query: "evil.example", entityId } }
    );
    const domains = result.patch.filter(
      (p) => p.resource === "identifier" && p.data.type === "domain"
    );
    expect(domains).toHaveLength(1);
    expect(domains[0]?.data.value).toBe("cdn.evil.example");
  });

  it("strips ports from IPv6 IOCs before validation", () => {
    const result = interpretThreatfoxLookupReport(
      {
        ...fixture,
        query: "2001:db8::1",
        kind: "ip",
        iocs: [
          {
            id: "4",
            ioc: "[2001:db8::1]:443",
            iocType: "ipv6",
            threatType: "botnet_cc",
            malware: "win.test",
            malwarePrintable: "Test",
            confidenceLevel: 50,
            firstSeen: null,
            lastSeen: null,
            tags: [],
          },
        ],
      },
      { input: { query: "2001:db8::1", entityId } }
    );
    expectProposesIdentifier(result, { type: "ip", value: "2001:db8::1" });
    expect(
      result.patch.filter((p) => p.resource === "identifier")
    ).toHaveLength(1);
  });

  it("does not double-count the seed when IOC spelling differs", () => {
    const result = interpretThreatfoxLookupReport(
      {
        ...fixture,
        query: "2001:0db8:0000:0000:0000:0000:0000:0001",
        kind: "ip",
        iocs: [
          {
            id: "5",
            ioc: "2001:db8::1",
            iocType: "ipv6",
            threatType: "botnet_cc",
            malware: "win.test",
            malwarePrintable: "Test",
            confidenceLevel: 50,
            firstSeen: null,
            lastSeen: null,
            tags: [],
          },
        ],
      },
      {
        input: {
          query: "2001:0db8:0000:0000:0000:0000:0000:0001",
          entityId,
        },
      }
    );
    expect(
      result.patch.filter(
        (p) => p.resource === "identifier" && p.data.type === "ip"
      )
    ).toHaveLength(1);
    expect(claimText(result, 1)).toMatch(/1 IOC\(s\)/);
  });

  it("does not let invalid IOCs consume the proposal budget", () => {
    const invalidIocs = Array.from({ length: 45 }, (_, index) => ({
      id: String(index),
      ioc: `not-an-ip-${index}`,
      iocType: "ip",
      threatType: "botnet_cc",
      malware: "win.test",
      malwarePrintable: "Test",
      confidenceLevel: 50,
      firstSeen: null,
      lastSeen: null,
      tags: [],
    }));
    const validIocs = Array.from({ length: 5 }, (_, index) => ({
      id: `valid-${index}`,
      ioc: `203.0.113.${index + 1}`,
      iocType: "ip",
      threatType: "botnet_cc",
      malware: "win.test",
      malwarePrintable: "Test",
      confidenceLevel: 50,
      firstSeen: null,
      lastSeen: null,
      tags: [],
    }));
    const result = interpretThreatfoxLookupReport(
      {
        ...fixture,
        iocs: [...invalidIocs, ...validIocs],
      },
      { input: { query: "1.2.3.4", entityId } }
    );
    const ips = result.patch.filter(
      (op) => op.resource === "identifier" && op.data.type === "ip"
    );
    expect(
      ips
        .map((op) => op.data.value)
        .filter((value): value is string => typeof value === "string")
        .sort((a, b) => a.localeCompare(b))
    ).toEqual(
      [
        "1.2.3.4",
        "203.0.113.1",
        "203.0.113.2",
        "203.0.113.3",
        "203.0.113.4",
        "203.0.113.5",
      ].sort((a, b) => a.localeCompare(b))
    );
    expect(claimText(result, ips.length)).toMatch(/5 IOC\(s\)/);
    expect(claimText(result, ips.length)).not.toMatch(/showing 5 of 50/);
  });

  it("seeds hash queries as other Identifiers", () => {
    const hash = "a".repeat(64);
    const result = interpretThreatfoxLookupReport(
      {
        ...fixture,
        query: hash,
        kind: "other",
        iocs: [],
      },
      { input: { query: hash, entityId } }
    );
    expectProposesIdentifier(result, { type: "other", value: hash });
  });
});
