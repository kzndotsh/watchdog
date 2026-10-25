import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";
import type { WaybackHistorySnapshot } from "@watchdog/tools/wayback";

import {
  claimText,
  expectProposesIdentifier,
  itRejectsIncompleteReport,
} from "../../../testing";
import { pageHistory } from "../cap.ts";
import {
  describePageHistory,
  interpretPageHistoryReport,
} from "../interpret.ts";

const version = (timestamp: string, titleChanged: boolean) => ({
  timestamp,
  original: "https://example.com/",
  archiveUrl: `https://web.archive.org/web/${timestamp}id_/https://example.com/`,
  digest: "D",
  contentHash: "a".repeat(64),
  mimetype: "text/html",
  byteLength: 10,
  bodyTruncated: false,
  title: "T",
  textLength: 5,
  artifactName: `page-${timestamp}.html`,
  change: titleChanged
    ? {
        titleChanged: true,
        previousTitle: "Old",
        textLengthDelta: 1,
        linesAdded: 1,
        linesRemoved: 0,
        sampleAdded: ["x"],
        sampleRemoved: [],
      }
    : null,
});

const report: WaybackHistorySnapshot = {
  url: "https://example.com/",
  queriedAt: "2026-01-01T00:00:00.000Z",
  source: "web.archive.org",
  after: null,
  before: null,
  maxVersions: 10,
  versionsListed: 2,
  totalCaptures: 9,
  versions: [version("20190101000000", false), version("20210615000000", true)],
  duplicates: [],
  failed: [],
  isTruncated: false,
};

describe("interpret", () => {
  const entityId = testId(1);

  it("proposes the URL Identifier and one Claim that the page changed between dates", () => {
    const result = interpretPageHistoryReport(report, {
      input: { url: "https://example.com/", entityId, maxVersions: 10 },
    });
    expectProposesIdentifier(result, {
      type: "url",
      value: "https://example.com",
    });
    expect(result.patch.length).toBe(2);
    expect(claimText(result, 1)).toMatch(
      /2 distinct versions between 2019-01-01 and 2021-06-15; 1 title change/
    );
  });

  it("notes versions not fetched and more available", () => {
    expect(
      describePageHistory({
        ...report,
        isTruncated: true,
        failed: [
          { timestamp: "20200101000000", reason: "http_error", status: 500 },
        ],
      })
    ).toMatch(/1 not fetched; more versions available/);
  });

  it("describes an empty history", () => {
    expect(describePageHistory({ ...report, versions: [] })).toBe(
      "no archived versions"
    );
  });

  itRejectsIncompleteReport(
    pageHistory,
    { url: "https://example.com/", maxVersions: 10 },
    { url: "https://example.com/", maxVersions: 10 }
  );
});
