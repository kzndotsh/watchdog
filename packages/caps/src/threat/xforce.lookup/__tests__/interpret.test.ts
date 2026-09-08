import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { xforceLookup } from "../cap.ts";
import { interpretXforceLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    query: "1.2.3.4",
    kind: "ip" as const,
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "exchange.xforce.ibmcloud.com" as const,
    found: true,
    score: 7.2,
    cats: { Botnet: 1 },
    malwareCount: 2,
  };

  it("interpretXforceLookupReport proposes observation Claim", () => {
    const result = interpretXforceLookupReport(fixture, {
      input: { query: "1.2.3.4", entityId },
    });
    expect(result.patch.length).toBe(2);
    expect(claimText(result, 1)).toMatch(/X-Force/);
    expect(claimText(result, 1)).toMatch(/score=7\.2/);
  });

  it("interpretXforceLookupReport reports 404 as not indexed", () => {
    const result = interpretXforceLookupReport(
      {
        ...fixture,
        found: false,
        score: null,
        cats: {},
        malwareCount: 0,
      },
      { input: { query: "1.2.3.4", entityId } }
    );
    expect(claimText(result, 1)).toMatch(/not indexed/);
  });

  itRejectsIncompleteReport(
    xforceLookup,
    { query: "1.2.3.4" },
    { query: "1.2.3.4" }
  );
});
