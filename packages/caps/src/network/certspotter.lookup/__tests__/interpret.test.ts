import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { certspotterLookup } from "../cap.ts";
import { interpretCertspotterLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    host: "example.com",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "api.certspotter.com/v1/issuances" as const,
    domains: ["example.com", "www.example.com"],
    issuances: [
      {
        id: "1",
        dnsNames: ["example.com", "www.example.com"],
        notBefore: "2025-01-01T00:00:00Z",
        notAfter: "2026-01-01T00:00:00Z",
        revoked: false,
        certSha256: "abc",
      },
    ],
  };

  it("interpretCertspotterLookupReport proposes domain Identifiers", () => {
    const result = interpretCertspotterLookupReport(fixture, {
      input: { host: "example.com", entityId },
    });
    expect(result.patch.length).toBe(3);
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("domain");
    expect(claimText(result, 2)).toMatch(/Cert Spotter/);
  });

  itRejectsIncompleteReport(
    certspotterLookup,
    { host: "example.com" },
    { host: "example.com" }
  );

  it("drops wildcard domains from identifier proposals", () => {
    const result = interpretCertspotterLookupReport(
      {
        ...fixture,
        domains: ["*.example.com", "www.example.com", "api.*.example.com"],
      },
      { input: { host: "example.com", entityId } }
    );
    const domains = result.patch.filter(
      (p) => p.resource === "identifier" && p.data.type === "domain"
    );
    expect(domains).toHaveLength(2);
    expect(
      domains
        .map((p) => (typeof p.data.value === "string" ? p.data.value : ""))
        .sort((a, b) => a.localeCompare(b))
    ).toEqual(["example.com", "www.example.com"]);
  });
});
