import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { pageEnrich } from "../cap.ts";
import { interpretPageEnrichReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    url: "https://example.com/",
    finalUrl: "https://example.com/",
    queriedAt: "2026-01-01T00:00:00.000Z",
    status: 200,
    ok: true,
    title: "Example",
    meta: {
      description: null,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      twitterCard: null,
      canonical: null,
    },
    trackers: [{ vendor: "google-analytics", evidence: "gtag" }],
  };

  it("interpretPageEnrichReport proposes url Identifier + Claim", () => {
    const result = interpretPageEnrichReport(fixture, {
      input: { url: "https://example.com/", entityId },
    });
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("url");
    const urls = result.patch.filter(
      (p) => p.resource === "identifier" && p.data.type === "url"
    );
    expect(urls).toHaveLength(1);
    expect(claimText(result, 1)).toMatch(/Example/);
    expect(claimText(result, 1)).toMatch(/google-analytics/);
  });

  it("includes canonical url when present", () => {
    const result = interpretPageEnrichReport(
      {
        ...fixture,
        meta: { ...fixture.meta, canonical: "https://example.com/canonical" },
      },
      { input: { url: "https://example.com/", entityId } }
    );
    const urls = result.patch.filter(
      (p) => p.resource === "identifier" && p.data.type === "url"
    );
    expect(urls).toHaveLength(2);
  });

  it("proposes both seed and final URLs after a redirect", () => {
    const result = interpretPageEnrichReport(
      {
        ...fixture,
        url: "https://t.co/abc",
        finalUrl: "https://example.com/landing",
      },
      { input: { url: "https://t.co/abc", entityId } }
    );
    const urls = result.patch.filter(
      (p) => p.resource === "identifier" && p.data.type === "url"
    );
    expect(
      urls
        .map((p) => (typeof p.data.value === "string" ? p.data.value : ""))
        .sort((a, b) => a.localeCompare(b))
    ).toEqual(["https://example.com/landing", "https://t.co/abc"]);
  });

  itRejectsIncompleteReport(
    pageEnrich,
    { url: "https://example.com/" },
    { url: "https://example.com/" }
  );
});
