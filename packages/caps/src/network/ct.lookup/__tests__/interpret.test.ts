import { describe, expect, it } from "vitest";

import {
  expectNoConfidenceOnPatch,
  expectProposesIdentifier,
  testId,
} from "@watchdog/test-kit";

import { ctLookup } from "../cap.ts";
import { interpretCtReport } from "../interpret.ts";

describe("interpretCtReport", () => {
  const entityId = testId(1);

  const fixture = {
    host: "example.com",
    source: "crt.sh" as const,
    queriedAt: "2026-01-01T00:00:00.000Z",
    entries: [
      {
        commonName: "www.example.com",
        nameValue: "www.example.com\napi.example.com",
        issuer: "Test CA",
        notBefore: "2025-01-01",
        notAfter: "2026-01-01",
        serial: "1",
      },
    ],
    domains: ["example.com", "www.example.com", "api.example.com"],
  };

  it("proposes domain identifiers when entityId is set", () => {
    const result = interpretCtReport(fixture, {
      input: { host: "example.com", entityId },
    });
    expectProposesIdentifier(result, { type: "domain", value: "example.com" });
    expectProposesIdentifier(result, {
      type: "domain",
      value: "www.example.com",
    });
    expectProposesIdentifier(result, {
      type: "domain",
      value: "api.example.com",
    });
    expect(
      result.patch.filter((p) => p.resource === "identifier")
    ).toHaveLength(3);
    expect(result.patch.filter((p) => p.resource === "claim")).toHaveLength(1);
    expectNoConfidenceOnPatch(result);
  });

  it("dedupes duplicate domains", () => {
    const result = interpretCtReport(
      { ...fixture, domains: ["example.com", "example.com", "EXAMPLE.COM"] },
      { input: { host: "example.com", entityId } }
    );
    const ids = result.patch.filter((p) => p.resource === "identifier");
    expect(ids).toHaveLength(1);
    expect(ids[0]?.data.value).toBe("example.com");
  });

  it("drops wildcard domains from identifier proposals", () => {
    const result = interpretCtReport(
      {
        ...fixture,
        domains: ["*.example.com", "www.example.com", "api.*.example.com"],
      },
      { input: { host: "example.com", entityId } }
    );
    const ids = result.patch.filter((p) => p.resource === "identifier");
    expect(ids).toHaveLength(2);
    expect(
      ids
        .map((p) => (typeof p.data.value === "string" ? p.data.value : ""))
        .sort((a, b) => a.localeCompare(b))
    ).toEqual(["example.com", "www.example.com"]);
  });

  it("caps domain identifiers and notes truncation in the summary", () => {
    const domains = Array.from({ length: 85 }, (_, i) => `sub${i}.example.com`);
    const result = interpretCtReport(
      { ...fixture, domains },
      { input: { host: "example.com", entityId } }
    );
    expect(
      result.patch.filter((p) => p.resource === "identifier")
    ).toHaveLength(80);
    expect(String(result.summary)).toMatch(/showing 80 of 86 in Identifiers/);
  });

  it("emits an empty patch when entityId is omitted", () => {
    const result = interpretCtReport(
      {
        host: "example.com",
        source: "crt.sh",
        queriedAt: "2026-01-01T00:00:00.000Z",
        entries: [],
        domains: ["example.com"],
      },
      { input: { host: "example.com" } }
    );
    expect(result.patch).toHaveLength(0);
    expect(String(result.summary)).toMatch(/no Entity/i);
  });
});

describe("ctLookup.handoff", () => {
  it("prepends the queried host and drops wildcard hosts", () => {
    const bag = ctLookup.handoff?.({
      host: "example.com",
      source: "crt.sh",
      queriedAt: "2026-01-01T00:00:00.000Z",
      entries: [],
      domains: [
        "*.example.com",
        "www.example.com",
        "api.*.example.com",
        "WWW.example.com",
      ],
    });
    expect(bag).toEqual({ host: ["example.com", "www.example.com"] });
  });

  it("returns undefined when CT found no domain names", () => {
    const bag = ctLookup.handoff?.({
      host: "example.com",
      source: "crt.sh",
      queriedAt: "2026-01-01T00:00:00.000Z",
      entries: [],
      domains: [],
    });
    expect(bag).toBeUndefined();
  });

  it("includes the seed when CT lists only subdomains", () => {
    const bag = ctLookup.handoff?.({
      host: "example.com",
      source: "crt.sh",
      queriedAt: "2026-01-01T00:00:00.000Z",
      entries: [],
      domains: ["www.example.com", "api.example.com"],
    });
    expect(bag).toEqual({
      host: ["example.com", "www.example.com", "api.example.com"],
    });
  });

  it("drops invalid domain seeds from handoff", () => {
    const bag = ctLookup.handoff?.({
      host: "example.com",
      source: "crt.sh",
      queriedAt: "2026-01-01T00:00:00.000Z",
      entries: [],
      domains: ["nodot", "www.example.com"],
    });
    expect(bag).toEqual({ host: ["example.com", "www.example.com"] });
  });
});
