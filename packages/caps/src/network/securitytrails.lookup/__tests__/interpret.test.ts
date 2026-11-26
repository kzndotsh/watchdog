import { describe, expect, it } from "vitest";

import type { SecurityTrailsLookupSnapshot } from "#tools/network";
import { testId } from "@watchdog/domain/test-kit";

import { claimText, dataOf, itRejectsIncompleteReport } from "../../../testing";
import { securityTrailsLookup } from "../cap.ts";
import { interpretSecurityTrailsLookupReport } from "../interpret.ts";

describe("interpretSecurityTrailsLookupReport", () => {
  const entityId = testId(1);

  const fixture: SecurityTrailsLookupSnapshot = {
    host: "example.com",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "api.securitytrails.com/v1",
    subdomains: ["www.example.com", "api.example.com"],
    subdomainCount: 2,
    ipHistory: [
      {
        ip: "200.121.20.1",
        firstSeen: "2017-05-26",
        lastSeen: "2018-01-02",
        organizations: ["netDNA"],
      },
    ],
    historyPages: 1,
  };

  it("proposes the seed, subdomains and historical IPs as Identifiers", () => {
    const result = interpretSecurityTrailsLookupReport(fixture, {
      input: { host: "example.com", entityId },
    });

    const ids = result.patch
      .filter((op) => op.kind === "identifier.create")
      .map((op) => [dataOf(op).type, dataOf(op).value]);
    expect(ids).toEqual([
      ["domain", "example.com"],
      ["domain", "www.example.com"],
      ["domain", "api.example.com"],
      ["ip", "200.121.20.1"],
    ]);
    expect(claimText(result, 4)).toMatch(
      /SecurityTrails for example.com: 3 domain\(s\); 1 historical A IP\(s\)/
    );
  });

  it("names the history page count when more pages exist", () => {
    const result = interpretSecurityTrailsLookupReport(
      { ...fixture, historyPages: 4 },
      { input: { host: "example.com", entityId } }
    );

    expect(String(result.summary)).toMatch(/from page 1 of 4/);
  });

  it("notes subdomain truncation past the batch limit", () => {
    const subdomains = Array.from(
      { length: 90 },
      (_, i) => `h${i}.example.com`
    );
    const result = interpretSecurityTrailsLookupReport(
      { ...fixture, subdomains, subdomainCount: 90 },
      { input: { host: "example.com", entityId } }
    );

    expect(
      result.patch.filter(
        (op) => op.kind === "identifier.create" && op.data.type === "domain"
      )
    ).toHaveLength(80);
    expect(String(result.summary)).toMatch(/proposed 80 of 91/);
  });

  itRejectsIncompleteReport(
    securityTrailsLookup,
    { host: "example.com" },
    { host: "example.com" }
  );
});
