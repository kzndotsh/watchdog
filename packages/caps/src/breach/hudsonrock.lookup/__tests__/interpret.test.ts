import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { hudsonrockLookup } from "../cap.ts";
import { interpretHudsonrockLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    query: "victim@example.com",
    kind: "email" as const,
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "api.hudsonrock.com" as const,
    found: true,
    totalResults: 2,
    newestDate: "2025-06-01",
  };

  it("interpretHudsonrockLookupReport proposes email Identifier + observation Claim", () => {
    const result = interpretHudsonrockLookupReport(fixture, {
      input: { query: fixture.query, entityId },
    });
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("email");
    expect(result.patch[0]?.data.value).toBe("victim@example.com");
    expect(result.patch[1]?.resource).toBe("claim");
    expect(claimText(result, 1)).toMatch(/Hudson Rock/);
    expect(claimText(result, 1)).toMatch(/infostealer exposure/);
    expect(claimText(result, 1)).toMatch(/2 exposure record\(s\)/);
    expect(claimText(result, 1)).not.toMatch(/password/i);
  });

  it("summarizes zero-result lookups as found", () => {
    const result = interpretHudsonrockLookupReport(
      {
        ...fixture,
        found: true,
        totalResults: 0,
        newestDate: null,
      },
      { input: { query: fixture.query, entityId } }
    );
    expect(claimText(result, 1)).toMatch(/0 exposure record\(s\)/);
    expect(claimText(result, 1)).not.toMatch(/not indexed/);
  });

  it("summarizes not-indexed queries separately from zero-hit lookups", () => {
    const result = interpretHudsonrockLookupReport(
      {
        ...fixture,
        found: false,
        totalResults: 0,
        newestDate: null,
      },
      { input: { query: fixture.query, entityId } }
    );
    expect(claimText(result, 1)).toMatch(/not indexed/);
  });

  itRejectsIncompleteReport(
    hudsonrockLookup,
    { query: "victim@example.com" },
    { query: "victim@example.com" }
  );
});
