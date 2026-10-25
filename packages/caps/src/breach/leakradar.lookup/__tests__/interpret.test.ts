import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";
import type { LeakradarLookupSnapshot } from "@watchdog/tools/breach";

import { claimText, itRejectsIncompleteReport } from "../../../testing";
import { leakradarLookup } from "../cap.ts";
import { interpretLeakradarLookupReport } from "../interpret.ts";

const record = (
  host: string | null,
  addedAt: string | null
): LeakradarLookupSnapshot["records"][number] => ({
  usernameMasked: "a***@example.com",
  host,
  sourceType: host === null ? null : "web",
  isEmail: true,
  addedAt,
  unlocked: false,
  category: null,
});

const emailReport: LeakradarLookupSnapshot = {
  query: "alice@example.com",
  kind: "email",
  queriedAt: "2026-01-01T00:00:00.000Z",
  source: "api.leakradar.io",
  found: true,
  total: 120,
  totalUnlocked: 0,
  domainCounts: null,
  page: 1,
  pageSize: 3,
  listed: true,
  isTruncated: true,
  records: [
    record("login.example.com", "2025-02-01T00:00:00Z"),
    record("login.example.com", "2025-09-15T00:00:00Z"),
    record("shop.example.org", "2024-01-01T00:00:00Z"),
  ],
};

const domainReport: LeakradarLookupSnapshot = {
  query: "example.com",
  kind: "domain",
  queriedAt: "2026-01-01T00:00:00.000Z",
  source: "api.leakradar.io",
  found: true,
  total: 15,
  totalUnlocked: null,
  domainCounts: {
    employees: 3,
    thirdParties: 5,
    customers: 7,
    approximate: true,
    samplingProbability: 0.1,
  },
  page: 1,
  pageSize: 25,
  listed: false,
  isTruncated: false,
  records: [],
};

describe("interpret", () => {
  const entityId = testId(1);
  const interpret = (report: LeakradarLookupSnapshot) =>
    interpretLeakradarLookupReport(report, {
      input: {
        query: report.query,
        pageSize: 25,
        page: 1,
        includeRecords: false,
        entityId,
      },
    });

  it("proposes one observation Claim with masked metadata and the breach caveat", () => {
    const result = interpret(emailReport);
    expect(result.patch).toHaveLength(1);
    expect(result.patch[0]).toMatchObject({
      op: "create",
      resource: "claim",
      data: { entityId, class: "observation" },
    });
    const text = claimText(result, 0);
    expect(text).toMatch(/LeakRadar \(masked, nothing unlocked\)/);
    expect(text).toMatch(/120 record\(s\)/);
    expect(text).toMatch(/3 masked record\(s\) read, more beyond page 1/);
    expect(text).toMatch(/most recent added 2025-09-15T00:00:00Z/);
    expect(text).toMatch(
      /source hosts: login\.example\.com \(2\), shop\.example\.org \(1\)/
    );
    expect(text).toMatch(/not that the person controls the account/);
  });

  it("proposes only the Claim: no Identifier and no confirmed class", () => {
    for (const report of [emailReport, domainReport]) {
      const result = interpret(report);
      expect(result.patch.every((op) => op.resource === "claim")).toBe(true);
      expect(JSON.stringify(result.patch)).not.toMatch(/confirmed/);
    }
  });

  it("summarizes a domain with per-category counts", () => {
    const text = claimText(interpret(domainReport), 0);
    expect(text).toMatch(/15 account\(s\) \(approximate\)/);
    expect(text).toMatch(/3 employee, 5 third-party, 7 customer/);
    expect(text).not.toMatch(/masked record\(s\) read/);
  });

  it("says so when nothing matched", () => {
    const text = claimText(
      interpret({ ...emailReport, found: false, total: 0, records: [] }),
      0
    );
    expect(text).toMatch(/no matching records/);
  });

  it("empty patch without entityId", () => {
    const result = interpretLeakradarLookupReport(emailReport, {
      input: {
        query: emailReport.query,
        pageSize: 25,
        page: 1,
        includeRecords: false,
      },
    });
    expect(result.patch).toEqual([]);
  });

  itRejectsIncompleteReport(
    leakradarLookup,
    { query: "alice@example.com" },
    { query: "alice@example.com" }
  );
});
