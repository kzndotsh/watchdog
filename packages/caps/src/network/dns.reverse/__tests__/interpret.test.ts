import { describe, it, expect } from "vitest";

import { testId } from "@watchdog/test-kit";

import { claimText, dataOf, itRejectsIncompleteReport } from "../../../testing";
import { dnsReverse } from "../cap.ts";
import { interpretDnsReverseReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    ip: "8.8.8.8",
    queriedAt: "2026-01-01T00:00:00.000Z",
    hostnames: ["dns.google"],
  };

  it("interpretDnsReverseReport proposes IP + domain Identifier + Claim", () => {
    const result = interpretDnsReverseReport(fixture, {
      input: { ip: "8.8.8.8", entityId },
    });
    expect(result.patch.length).toBe(3);
    expect(result.patch[0]?.kind).toBe("identifier.create");
    expect(dataOf(result.patch[0]).type).toBe("ip");
    expect(dataOf(result.patch[0]).value).toBe("8.8.8.8");
    expect(result.patch[1]?.kind).toBe("identifier.create");
    expect(dataOf(result.patch[1]).type).toBe("domain");
    expect(dataOf(result.patch[1]).value).toBe("dns.google");
    expect(result.patch[2]?.kind).toBe("claim.create");
    expect(claimText(result, 2)).toMatch(/dns\.google/);
  });

  it("interpretDnsReverseReport empty patch without entityId", () => {
    const result = interpretDnsReverseReport(fixture, {
      input: { ip: "8.8.8.8" },
    });
    expect(result.patch).toEqual([]);
  });

  itRejectsIncompleteReport(dnsReverse, { ip: "8.8.8.8" }, { ip: "8.8.8.8" });

  it("drops wildcard PTR hostnames from identifier proposals", () => {
    const result = interpretDnsReverseReport(
      { ...fixture, hostnames: ["*.example.com", "dns.google"] },
      { input: { ip: fixture.ip, entityId } }
    );
    const domains = result.patch.filter(
      (p) => p.kind === "identifier.create" && p.data.type === "domain"
    );
    expect(domains).toHaveLength(1);
    expect(dataOf(domains[0]).value).toBe("dns.google");
  });

  it("notes hostname truncation in the claim when PTR exceeds the cap", () => {
    const hostnames = Array.from(
      { length: 85 },
      (_, i) => `ptr${i}.example.com`
    );
    const result = interpretDnsReverseReport(
      { ...fixture, hostnames },
      { input: { ip: fixture.ip, entityId } }
    );
    expect(
      result.patch.filter(
        (p) => p.kind === "identifier.create" && p.data.type === "domain"
      )
    ).toHaveLength(80);
    expect(String(result.summary)).toMatch(
      /proposed 80 of 85; the rest are only in the Job report/
    );
  });
});
