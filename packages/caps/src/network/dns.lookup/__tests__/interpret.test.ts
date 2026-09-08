import { describe, expect, it } from "vitest";

import {
  expectNoConfidenceOnPatch,
  expectProposesIdentifier,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { dnsLookup } from "../cap.ts";
import { interpretDnsReport } from "../interpret.ts";

describe("interpretDnsReport", () => {
  const entityId = testId(1);

  const fixture = {
    host: "example.com",
    a: ["93.184.216.34"],
    aaaa: ["2606:2800:220:1:248:1893:25c8:1946"],
    mx: [{ exchange: "mail.example.com.", priority: 10 }],
    txt: [["v=spf1 -all"]],
    ns: ["a.iana-servers.net."],
  };

  it("proposes ip identifiers when entityId is set", () => {
    const result = interpretDnsReport(fixture, {
      input: { host: "example.com", entityId },
    });
    expectProposesIdentifier(result, { type: "domain", value: "example.com" });
    expectProposesIdentifier(result, { type: "ip", value: "93.184.216.34" });
    expectProposesIdentifier(result, {
      type: "ip",
      value: "2606:2800:220:1:248:1893:25c8:1946",
    });
    const ids = result.patch.filter((p) => p.resource === "identifier");
    expect(ids).toHaveLength(3);
    expect(result.patch.filter((p) => p.resource === "claim")).toHaveLength(1);
    expect(String(result.summary)).toMatch(/93\.184\.216\.34/);
    expect(String(result.summary)).toMatch(/a\.iana-servers\.net/);
    expectNoConfidenceOnPatch(result);
  });

  it("emits an empty patch when entityId is omitted", () => {
    const result = interpretDnsReport(fixture, {
      input: { host: "example.com" },
    });
    expect(result.patch).toEqual([]);
    expect(String(result.summary)).toMatch(/no Entity/i);
  });

  it("does not propose ip identifiers from empty A and AAAA arrays", () => {
    const result = interpretDnsReport(
      { ...fixture, a: [], aaaa: [] },
      { input: { host: "example.com", entityId } }
    );
    expectProposesIdentifier(result, { type: "domain", value: "example.com" });
    expect(
      result.patch.filter(
        (p) => p.resource === "identifier" && p.data.type === "ip"
      )
    ).toEqual([]);
    expect(result.patch.filter((p) => p.resource === "claim")).toHaveLength(1);
  });

  it("dedupes duplicate A records into one ip identifier", () => {
    const result = interpretDnsReport(
      { ...fixture, a: ["93.184.216.34", "93.184.216.34"], aaaa: [] },
      { input: { host: "example.com", entityId } }
    );
    const ips = result.patch.filter(
      (p) => p.resource === "identifier" && p.data.type === "ip"
    );
    expect(ips).toHaveLength(1);
    expect(ips[0]?.data.value).toBe("93.184.216.34");
  });

  it("dedupes equivalent IPv6 AAAA spellings into one ip identifier", () => {
    const result = interpretDnsReport(
      {
        ...fixture,
        a: [],
        aaaa: ["2001:0db8:0000:0000:0000:0000:0000:0001", "2001:db8::1"],
      },
      { input: { host: "example.com", entityId } }
    );
    const ips = result.patch.filter(
      (p) => p.resource === "identifier" && p.data.type === "ip"
    );
    expect(ips).toHaveLength(1);
    expect(ips[0]?.data.value).toBe("2001:db8::1");
  });

  it("caps IP identifiers and notes truncation in the claim", () => {
    const a = Array.from(
      { length: 85 },
      (_, i) => `10.0.${Math.floor(i / 256)}.${i % 256}`
    );
    const result = interpretDnsReport(
      { ...fixture, a, aaaa: [] },
      { input: { host: "example.com", entityId } }
    );
    expect(
      result.patch.filter(
        (p) => p.resource === "identifier" && p.data.type === "ip"
      )
    ).toHaveLength(80);
    expect(String(result.summary)).toMatch(/showing 80 of 85 in Identifiers/);
  });

  itRejectsIncompleteReport(
    dnsLookup,
    { host: "example.com" },
    { host: "example.com" }
  );
});
