import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

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
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("ip");
    expect(result.patch[0]?.data.value).toBe("8.8.8.8");
    expect(result.patch[1]?.resource).toBe("identifier");
    expect(result.patch[1]?.data.type).toBe("domain");
    expect(result.patch[1]?.data.value).toBe("dns.google");
    expect(result.patch[2]?.resource).toBe("claim");
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
      (p) => p.resource === "identifier" && p.data.type === "domain"
    );
    expect(domains).toHaveLength(1);
    expect(domains[0]?.data.value).toBe("dns.google");
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
        (p) => p.resource === "identifier" && p.data.type === "domain"
      )
    ).toHaveLength(80);
    expect(String(result.summary)).toMatch(/showing 80 of 85 in Identifiers/);
  });
});
