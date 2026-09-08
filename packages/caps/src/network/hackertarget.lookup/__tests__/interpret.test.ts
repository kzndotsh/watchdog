import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { hackertargetLookup } from "../cap.ts";
import { interpretHackertargetLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    ip: "1.1.1.1",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "api.hackertarget.com/reverseiplookup" as const,
    domains: ["one.one.one.one", "cloudflare-dns.com"],
    error: null,
  };

  it("interpretHackertargetLookupReport proposes IP + domain Identifiers + Claim", () => {
    const result = interpretHackertargetLookupReport(fixture, {
      input: { ip: "1.1.1.1", entityId },
    });
    expect(result.patch.length).toBe(4);
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("ip");
    expect(result.patch[0]?.data.value).toBe("1.1.1.1");
    expect(result.patch[1]?.resource).toBe("identifier");
    expect(result.patch[1]?.data.type).toBe("domain");
    expect(result.patch[3]?.resource).toBe("claim");
    expect(claimText(result, 3)).toMatch(/2 host/);
  });

  itRejectsIncompleteReport(
    hackertargetLookup,
    { ip: "1.1.1.1" },
    { ip: "1.1.1.1" }
  );

  it("notes host truncation in the claim when domains exceed the cap", () => {
    const domains = Array.from(
      { length: 85 },
      (_, i) => `host${i}.example.com`
    );
    const result = interpretHackertargetLookupReport(
      { ...fixture, domains },
      { input: { ip: "1.1.1.1", entityId } }
    );
    expect(
      result.patch.filter(
        (p) => p.resource === "identifier" && p.data.type === "domain"
      )
    ).toHaveLength(80);
    expect(String(result.summary)).toMatch(/showing 80 of 85 in Identifiers/);
  });
});
