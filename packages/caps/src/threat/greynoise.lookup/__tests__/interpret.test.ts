import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { greynoiseLookup } from "../cap.ts";
import { interpretGreynoiseLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    ip: "1.2.3.4",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "api.greynoise.io/v3/community" as const,
    found: true,
    noise: true,
    riot: false,
    classification: "malicious",
    name: null,
    link: "https://viz.greynoise.io/ip/1.2.3.4",
    lastSeen: "2026-01-01",
    message: null,
    authenticated: true,
  };

  it("interpretGreynoiseLookupReport proposes observation Claim", () => {
    const result = interpretGreynoiseLookupReport(fixture, {
      input: { ip: "1.2.3.4", entityId },
    });
    expect(result.patch.length).toBe(2);
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("ip");
    expect(result.patch[0]?.data.value).toBe("1.2.3.4");
    expect(claimText(result, 1)).toMatch(/noise=true/);
  });

  it("summarizes clean community lookups as found", () => {
    const result = interpretGreynoiseLookupReport(
      {
        ...fixture,
        found: true,
        noise: false,
        riot: false,
        classification: "benign",
        message: "Success",
      },
      { input: { ip: "8.8.8.8", entityId } }
    );
    expect(claimText(result, 1)).toMatch(/noise=false/);
    expect(claimText(result, 1)).toMatch(/RIOT=false/);
  });

  it("summarizes not-indexed IPs separately from clean lookups", () => {
    const result = interpretGreynoiseLookupReport(
      {
        ...fixture,
        found: false,
        noise: null,
        riot: null,
        classification: null,
        message: null,
      },
      { input: { ip: "1.2.3.4", entityId } }
    );
    expect(claimText(result, 1)).toMatch(/not indexed/);
  });

  itRejectsIncompleteReport(
    greynoiseLookup,
    { ip: "1.2.3.4" },
    { ip: "1.2.3.4" }
  );
});
