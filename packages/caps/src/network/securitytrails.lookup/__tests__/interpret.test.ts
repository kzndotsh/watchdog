import { describe, expect, it } from "vitest";

import type {
  SecurityTrailsDnsSighting,
  SecurityTrailsLookupSnapshot,
} from "#tools/network";
import { testId } from "@watchdog/domain/test-kit";

import { claimText, dataOf, itRejectsIncompleteReport } from "../../../testing";
import { securityTrailsLookup } from "../cap.ts";
import { securityTrailsLookupInput } from "../input.ts";
import { interpretSecurityTrailsLookupReport } from "../interpret.ts";

function sighting(value: string): SecurityTrailsDnsSighting {
  return {
    value,
    firstSeen: "2026-11-18",
    lastSeen: "2026-11-26",
    organizations: [],
    cname: null,
  };
}

describe("interpretSecurityTrailsLookupReport", () => {
  const entityId = testId(1);

  const fixture: SecurityTrailsLookupSnapshot = {
    host: "example.com",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "api.securitytrails.com/v1",
    subdomains: ["www.example.com", "api.example.com"],
    subdomainCount: 2,
    dnsHistory: [
      { type: "a", pages: 1, records: [sighting("200.121.20.1")] },
      { type: "aaaa", pages: 1, records: [sighting("2001:db8::1")] },
      { type: "mx", pages: 1, records: [sighting("mail.example.net")] },
      { type: "txt", pages: 1, records: [sighting("v=spf1 -all")] },
    ],
  };

  it("proposes the seed, subdomains and A/AAAA history as Identifiers", () => {
    const result = interpretSecurityTrailsLookupReport(fixture, {
      input: { host: "example.com", entityId, recordTypes: ["a"] },
    });

    const ids = result.patch
      .filter((op) => op.kind === "identifier.create")
      .map((op) => [dataOf(op).type, dataOf(op).value]);
    expect(ids).toEqual([
      ["domain", "example.com"],
      ["domain", "www.example.com"],
      ["domain", "api.example.com"],
      ["ip", "200.121.20.1"],
      ["ip", "2001:db8::1"],
    ]);
    expect(claimText(result, 5)).toMatch(
      /SecurityTrails for example.com: 3 domain\(s\); DNS history A 1, AAAA 1, MX 1 \[mail\.example\.net\], TXT 1 \[v=spf1 -all\]; 2 historical IP\(s\)/
    );
  });

  it("names the page count of a type with more history", () => {
    const result = interpretSecurityTrailsLookupReport(
      {
        ...fixture,
        dnsHistory: [
          { type: "a", pages: 4, records: [sighting("200.121.20.1")] },
        ],
      },
      { input: { host: "example.com", entityId, recordTypes: ["a"] } }
    );

    expect(String(result.summary)).toMatch(/A 1 \(page 1 of 4\)/);
  });

  it("notes subdomain truncation past the batch limit", () => {
    const subdomains = Array.from(
      { length: 90 },
      (_, i) => `h${i}.example.com`
    );
    const result = interpretSecurityTrailsLookupReport(
      { ...fixture, subdomains, subdomainCount: 90 },
      { input: { host: "example.com", entityId, recordTypes: ["a"] } }
    );

    expect(
      result.patch.filter(
        (op) => op.kind === "identifier.create" && op.data.type === "domain"
      )
    ).toHaveLength(80);
    expect(String(result.summary)).toMatch(/proposed 80 of 91/);
  });

  it("lists at most five distinct non-IP values per type and counts the rest", () => {
    const hosts = Array.from({ length: 7 }, (_, i) => `ns${i}.example.net`);
    const result = interpretSecurityTrailsLookupReport(
      {
        ...fixture,
        dnsHistory: [
          {
            type: "ns",
            pages: 1,
            records: [...hosts, "ns0.example.net"].map(sighting),
          },
        ],
      },
      { input: { host: "example.com", entityId, recordTypes: ["ns"] } }
    );

    expect(String(result.summary)).toContain(
      "NS 8 [ns0.example.net | ns1.example.net | ns2.example.net | ns3.example.net | ns4.example.net +2 more]"
    );
  });

  itRejectsIncompleteReport(
    securityTrailsLookup,
    { host: "example.com" },
    { host: "example.com" }
  );
});

describe("securityTrailsLookupInput", () => {
  it("puts record types in one canonical order without repeats", () => {
    const input = securityTrailsLookupInput.parse({
      host: "example.com",
      recordTypes: ["TXT", "a", "mx", "a"],
    });

    expect(input.recordTypes).toEqual(["a", "mx", "txt"]);
  });

  it("defaults to A so an omitted choice matches an explicit one", () => {
    const omitted = securityTrailsLookupInput.parse({ host: "example.com" });
    const explicit = securityTrailsLookupInput.parse({
      host: "example.com",
      recordTypes: ["a"],
    });

    expect(omitted).toEqual(explicit);
  });

  it("rejects an unknown record type", () => {
    const parsed = securityTrailsLookupInput.safeParse({
      host: "example.com",
      recordTypes: ["a", "cname"],
    });

    expect(parsed.success).toBe(false);
  });
});
