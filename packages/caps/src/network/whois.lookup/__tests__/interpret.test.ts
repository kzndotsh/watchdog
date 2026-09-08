import { describe, expect, it } from "vitest";

import {
  expectNoConfidenceOnPatch,
  expectProposesClaim,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { interpretWhoisSnapshot } from "../../../lib/collect/interpret-whois-snapshot.ts";
import { whoisLookup } from "../cap.ts";
import { interpretWhoisReport } from "../interpret.ts";

describe("interpretWhoisReport", () => {
  const entityId = testId(1);

  const fixture = {
    host: "example.com",
    source: "rdap" as const,
    registrar: "Example Registrar",
    registrantOrg: null,
    nameservers: ["a.iana-servers.net."],
    status: ["active"],
    registeredAt: "2017-08-14T00:00:00.000Z",
    expiresAt: "2030-08-14T00:00:00.000Z",
    raw: {},
  };

  it("proposes a claim when entityId is set", () => {
    const result = interpretWhoisReport(fixture, {
      input: { host: "example.com", entityId },
    });
    expect(
      result.patch.filter((p) => p.resource === "identifier")
    ).toHaveLength(0);
    expectProposesClaim(result, { textMatches: /Example Registrar/ });
    expect(String(result.summary)).toMatch(/expires=/);
    expect(String(result.summary)).toMatch(/a\.iana-servers\.net/);
    expect(result.patch.filter((p) => p.resource === "event")).toHaveLength(0);
    expectNoConfidenceOnPatch(result);
  });

  it("still proposes a claim when nameservers are empty", () => {
    const result = interpretWhoisReport(
      { ...fixture, nameservers: [] },
      { input: { host: "example.com", entityId } }
    );
    expectProposesClaim(result, { textMatches: /Example Registrar/ });
    expect(String(result.summary)).not.toMatch(/NS=/);
  });

  it("emits an empty patch when entityId is omitted", () => {
    const result = interpretWhoisReport(fixture, {
      input: { host: "example.com" },
    });
    expect(result.patch).toEqual([]);
    expect(String(result.summary)).toMatch(/no Entity/i);
  });

  itRejectsIncompleteReport(
    whoisLookup,
    { host: "example.com", source: "rdap" },
    { host: "example.com" }
  );
});

describe("interpretWhoisSnapshot", () => {
  const entityId = testId(1);

  const fixture = {
    host: "example.com",
    source: "rdap" as const,
    registrar: "Example Registrar",
    registrantOrg: null,
    nameservers: ["a.iana-servers.net."],
    status: ["active"],
    registeredAt: "2017-08-14T00:00:00.000Z",
    expiresAt: "2030-08-14T00:00:00.000Z",
    raw: {},
  };

  it("adds an expiry event when expiry is within 90 days", () => {
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const result = interpretWhoisSnapshot({
      report: { ...fixture, expiresAt: soon },
      entityId,
      claimLabel: "WHOIS",
      noEntitySummary: "none",
      nowMs: Date.now(),
    });
    const events = result.patch.filter((p) => p.resource === "event");
    expect(events).toHaveLength(1);
    expect(events[0]?.data.when).toBe(soon);
    expect(events[0]?.data.what).toBe("WHOIS expiry for example.com");
    expectNoConfidenceOnPatch(result);
  });

  it("lands extraBatches Identifiers before the Claim", () => {
    const result = interpretWhoisSnapshot({
      report: fixture,
      entityId,
      claimLabel: "WHOIS",
      noEntitySummary: "none",
      extraBatches: [{ type: "email", values: ["admin@example.com"] }],
    });
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("email");
    expect(result.patch[1]?.resource).toBe("claim");
  });

  it("treats whitespace-only entityId as missing", () => {
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const result = interpretWhoisSnapshot({
      report: { ...fixture, expiresAt: soon },
      entityId: "   ",
      claimLabel: "WHOIS",
      noEntitySummary: "none",
      nowMs: Date.now(),
    });
    expect(result.patch).toEqual([]);
    expect(result.summary).toBe("none");
  });
});
