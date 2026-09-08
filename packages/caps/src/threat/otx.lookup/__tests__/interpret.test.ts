import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { otxLookup } from "../cap.ts";
import { interpretOtxLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    query: "1.2.3.4",
    kind: "ip" as const,
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "otx.alienvault.com" as const,
    found: true,
    pulseCount: 3,
    pulseNames: ["Emotet campaign", "Cobalt Strike infra"],
    malwareFamilies: ["Emotet", "Cobalt Strike"],
  };

  it("interpretOtxLookupReport proposes observation Claim", () => {
    const result = interpretOtxLookupReport(fixture, {
      input: { query: "1.2.3.4", entityId },
    });
    expect(result.patch.length).toBe(2);
    expect(claimText(result, 1)).toMatch(/OTX \(AlienVault\)/);
    expect(claimText(result, 1)).toMatch(/Emotet/);
    expect(claimText(result, 1)).toMatch(/pulses: Emotet campaign/);
  });

  it("summarizes zero-pulse lookups as found", () => {
    const result = interpretOtxLookupReport(
      {
        ...fixture,
        found: true,
        pulseCount: 0,
        pulseNames: [],
        malwareFamilies: [],
      },
      { input: { query: "8.8.8.8", entityId } }
    );
    expect(claimText(result, 1)).toMatch(/0 pulse\(s\)/);
    expect(claimText(result, 1)).not.toMatch(/not indexed/);
  });

  it("seeds URL lookups as url Identifiers", () => {
    const result = interpretOtxLookupReport(
      {
        ...fixture,
        query: "https://evil.example/path",
        kind: "url",
      },
      { input: { query: "https://evil.example/path", entityId } }
    );
    expect(
      result.patch.some(
        (p) => p.resource === "identifier" && p.data.type === "url"
      )
    ).toBe(true);
  });

  itRejectsIncompleteReport(
    otxLookup,
    { query: "1.2.3.4" },
    { query: "1.2.3.4" }
  );
});
