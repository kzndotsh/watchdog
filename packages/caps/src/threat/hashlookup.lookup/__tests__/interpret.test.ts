import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { hashlookupLookup } from "../cap.ts";
import { interpretHashlookupLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const foundFixture = {
    hash: "44d88612fea8a8f36de82e1278abb02f",
    algo: "md5" as const,
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "hashlookup.circl.lu" as const,
    found: true,
    trust: 100,
    fileName: "eicar.com",
    product: "EICAR Test File",
    md5: "44d88612fea8a8f36de82e1278abb02f",
    sha1: null,
    sha256: null,
    parentCount: 0,
    childCount: 0,
  };

  const notFoundFixture = {
    ...foundFixture,
    found: false,
    trust: null,
    fileName: null,
    product: null,
  };

  it("interpretHashlookupLookupReport proposes hash Identifier + observation Claim", () => {
    const result = interpretHashlookupLookupReport(foundFixture, {
      input: { hash: foundFixture.hash, entityId },
    });
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("other");
    expect(result.patch[0]?.data.value).toBe(foundFixture.hash);
    expect(result.patch[1]?.resource).toBe("claim");
    expect(claimText(result, 1)).toMatch(/known file/);
    expect(claimText(result, 1)).toMatch(/EICAR Test File/);
  });

  it("interpretHashlookupLookupReport reports not-found without inventing malware language", () => {
    const result = interpretHashlookupLookupReport(notFoundFixture, {
      input: { hash: notFoundFixture.hash, entityId },
    });
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(claimText(result, 1)).toMatch(/not a known file/);
    expect(claimText(result, 1)).not.toMatch(/malware/i);
  });

  itRejectsIncompleteReport(
    hashlookupLookup,
    { hash: foundFixture.hash },
    { hash: foundFixture.hash }
  );
});
