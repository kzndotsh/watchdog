import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { cymruMhrLookup } from "../cap.ts";
import { interpretCymruMhrLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const foundFixture = {
    hash: "8a62d103168974fba9c61edab336038c",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "hash.cymru.com" as const,
    found: true,
    lastSeenEpoch: 1_611_956_489,
    detectionPct: 28,
  };

  const notFoundFixture = {
    hash: "8a62d103168974fba9c61edab336038c",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "hash.cymru.com" as const,
    found: false,
    lastSeenEpoch: null,
    detectionPct: null,
  };

  it("interpretCymruMhrLookupReport proposes hash Identifier + observation Claim", () => {
    const result = interpretCymruMhrLookupReport(foundFixture, {
      input: { hash: foundFixture.hash, entityId },
    });
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("other");
    expect(result.patch[0]?.data.value).toBe(foundFixture.hash);
    expect(result.patch[1]?.resource).toBe("claim");
    expect(claimText(result, 1)).toMatch(/known malware hash/);
    expect(claimText(result, 1)).toMatch(/28%/);
  });

  it("interpretCymruMhrLookupReport reports not-found softly", () => {
    const result = interpretCymruMhrLookupReport(notFoundFixture, {
      input: { hash: notFoundFixture.hash, entityId },
    });
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(claimText(result, 1)).toMatch(/not in the malware hash registry/);
  });

  itRejectsIncompleteReport(
    cymruMhrLookup,
    { hash: foundFixture.hash },
    { hash: foundFixture.hash }
  );
});
