import { describe, it, expect } from "vitest";

import { testId } from "@watchdog/domain/test-kit";

import { claimText, dataOf, itRejectsIncompleteReport } from "../../../testing";
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
    expect(result.patch[0]?.kind).toBe("identifier.create");
    expect(dataOf(result.patch[0]).type).toBe("ip");
    expect(dataOf(result.patch[0]).value).toBe("1.1.1.1");
    expect(result.patch[1]?.kind).toBe("identifier.create");
    expect(dataOf(result.patch[1]).type).toBe("domain");
    expect(result.patch[3]?.kind).toBe("claim.create");
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
        (p) => p.kind === "identifier.create" && p.data.type === "domain"
      )
    ).toHaveLength(80);
    expect(String(result.summary)).toMatch(
      /proposed 80 of 85; the rest are only in the Job report/
    );
  });
});
