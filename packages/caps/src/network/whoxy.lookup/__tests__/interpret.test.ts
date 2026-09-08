import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { whoxyLookup } from "../cap.ts";
import { interpretWhoxyLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    host: "example.com",
    queriedAt: "2026-01-01T00:00:00.000Z",
    status: 200,
    ok: true,
    registrarName: "Example Registrar",
    createDate: "1995-08-14",
    updateDate: "2025-01-01",
    expireDate: "2026-08-13",
    domainRegistrar: "Example Registrar",
    nameServers: ["ns1.example.com", "ns2.example.com"],
    registrantName: null,
    registrantEmail: "admin@example.com",
    registrantOrg: "Example Org",
    registrantCountry: "US",
    rawStatus: 1,
  };

  it("interpretWhoxyLookupReport proposes domain, registrant email, Claim, and expiry Event", () => {
    const result = interpretWhoxyLookupReport(fixture, {
      input: { host: "example.com", entityId },
    });
    const types = result.patch.map((p) => p.resource);
    expect(types).toContain("identifier");
    expect(types).toContain("claim");
    expect(types).toContain("event");
    const identifierTypes = result.patch
      .filter((p) => p.resource === "identifier")
      .map((p) => p.data.type);
    expect(identifierTypes).toContain("domain");
    expect(identifierTypes).toContain("email");
    expect(claimText(result, 2)).toMatch(/Example Registrar/);
  });

  it("interpretWhoxyLookupReport miss is an observation Claim", () => {
    const result = interpretWhoxyLookupReport(
      { ...fixture, ok: false },
      { input: { host: "example.com", entityId } }
    );
    expect(result.patch).toHaveLength(1);
    expect(claimText(result, 0)).toMatch(/no WHOIS record/);
  });

  itRejectsIncompleteReport(
    whoxyLookup,
    { host: "example.com" },
    { host: "example.com" }
  );
});
