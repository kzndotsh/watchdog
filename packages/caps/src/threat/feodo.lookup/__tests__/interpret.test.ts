import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { feodoLookup } from "../cap.ts";
import { interpretFeodoLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    ip: "1.2.3.4",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "feodotracker.abuse.ch" as const,
    found: true,
    malware: "Dridex",
    status: "online",
    firstSeen: "2026-01-01 00:00:00",
    lastOnline: "2026-01-02",
  };

  it("interpretFeodoLookupReport proposes observation Claim", () => {
    const result = interpretFeodoLookupReport(fixture, {
      input: { ip: "1.2.3.4", entityId },
    });
    expect(result.patch.length).toBe(2);
    expect(claimText(result, 1)).toMatch(/Dridex/);
  });

  itRejectsIncompleteReport(feodoLookup, { ip: "1.2.3.4" }, { ip: "1.2.3.4" });
});
