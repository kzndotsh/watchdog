import { describe, it, expect } from "vitest";

import { testId } from "@watchdog/test-kit";

import { claimText, itRejectsIncompleteReport } from "../../../testing";
import { txtInventory } from "../cap.ts";
import { interpretTxtInventoryReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    host: "example.com",
    queriedAt: "2026-01-01T00:00:00.000Z",
    records: ["google-site-verification=abc", "v=spf1 -all"],
    tokens: [
      {
        record: "google-site-verification=abc",
        kind: "verification" as const,
        service: "google_search_console",
        product: "Google Search Console",
      },
      {
        record: "v=spf1 -all",
        kind: "spf" as const,
        service: "spf",
        product: "SPF",
      },
    ],
  };

  it("interpretTxtInventoryReport proposes Claim when entityId set", () => {
    const result = interpretTxtInventoryReport(fixture, {
      input: { host: "example.com", entityId },
    });
    expect(result.patch.length).toBe(1);
    expect(result.patch[0]?.resource).toBe("claim");
    expect(claimText(result, 0)).toMatch(/Google Search Console/);
    expect(claimText(result, 0)).toMatch(/SPF/);
  });

  it("interpretTxtInventoryReport empty patch without entityId", () => {
    const result = interpretTxtInventoryReport(fixture, {
      input: { host: "example.com" },
    });
    expect(result.patch).toEqual([]);
  });

  itRejectsIncompleteReport(
    txtInventory,
    { host: "example.com" },
    { host: "example.com" }
  );
});
