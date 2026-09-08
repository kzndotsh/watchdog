import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { mnemonicLookup } from "../cap.ts";
import { interpretMnemonicLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    query: "8.8.8.8",
    kind: "ip" as const,
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "api.mnemonic.no/pdns/v3" as const,
    count: 10,
    records: [
      {
        query: "dns.google",
        answer: "8.8.8.8",
        rrtype: "a",
        times: 5,
        firstSeenAt: "2025-01-01T00:00:00.000Z",
        lastSeenAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    domains: ["dns.google"],
    ips: [],
  };

  it("interpretMnemonicLookupReport proposes seed IP + domain Identifiers", () => {
    const result = interpretMnemonicLookupReport(fixture, {
      input: { query: "8.8.8.8", entityId },
    });
    expect(result.patch.length).toBe(3);
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("ip");
    expect(result.patch[0]?.data.value).toBe("8.8.8.8");
    expect(result.patch[1]?.resource).toBe("identifier");
    expect(result.patch[1]?.data.type).toBe("domain");
    expect(claimText(result, 2)).toMatch(/Mnemonic PDNS/);
  });

  it("interpretMnemonicLookupReport also proposes PDNS IPs", () => {
    const result = interpretMnemonicLookupReport(
      {
        ...fixture,
        kind: "domain",
        query: "dns.google",
        ips: ["8.8.8.8"],
        domains: ["dns.google"],
      },
      { input: { query: "dns.google", entityId } }
    );
    const ids = result.patch.filter((p) => p.resource === "identifier");
    expect(ids).toHaveLength(2);
    const types = ids.map((p) =>
      typeof p.data.type === "string" ? p.data.type : ""
    );
    expect(types.sort((a, b) => a.localeCompare(b))).toEqual(["domain", "ip"]);
    expect(ids.find((p) => p.data.type === "domain")?.data.value).toBe(
      "dns.google"
    );
    expect(ids.find((p) => p.data.type === "ip")?.data.value).toBe("8.8.8.8");
  });

  it("notes domain truncation in the claim when PDNS domains exceed the cap", () => {
    const domains = Array.from(
      { length: 85 },
      (_, i) => `host${i}.example.com`
    );
    const result = interpretMnemonicLookupReport(
      {
        ...fixture,
        kind: "ip",
        domains,
      },
      { input: { query: "8.8.8.8", entityId } }
    );
    expect(
      result.patch.filter(
        (p) => p.resource === "identifier" && p.data.type === "domain"
      )
    ).toHaveLength(80);
    expect(String(result.summary)).toMatch(/showing 80 of 85 in Identifiers/);
  });

  itRejectsIncompleteReport(
    mnemonicLookup,
    { query: "8.8.8.8" },
    { query: "8.8.8.8" }
  );
});
