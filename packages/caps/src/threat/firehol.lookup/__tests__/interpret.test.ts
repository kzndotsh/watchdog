import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { fireholLookup } from "../cap.ts";
import { interpretFireholLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const listedFixture = {
    ip: "1.2.3.4",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "iplists.firehol.org" as const,
    list: "firehol_level1" as const,
    found: true,
  };

  const notListedFixture = { ...listedFixture, found: false };

  it("interpretFireholLookupReport flags a listed IP", () => {
    const result = interpretFireholLookupReport(listedFixture, {
      input: { ip: listedFixture.ip, entityId },
    });
    expect(result.patch.length).toBe(2);
    expect(claimText(result, 1)).toMatch(/is listed/);
  });

  it("interpretFireholLookupReport reports non-membership", () => {
    const result = interpretFireholLookupReport(notListedFixture, {
      input: { ip: notListedFixture.ip, entityId },
    });
    expect(claimText(result, 1)).toMatch(/is not listed/);
  });

  itRejectsIncompleteReport(
    fireholLookup,
    { ip: "1.2.3.4" },
    { ip: "1.2.3.4" }
  );
});
