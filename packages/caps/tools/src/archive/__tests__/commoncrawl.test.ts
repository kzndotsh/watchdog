import { describe, expect, it } from "vitest";

import { assertCommonCrawlCdxApiUrl } from "../commoncrawl";

describe("commoncrawl", () => {
  it("accepts trusted Common Crawl CDX API URLs", () => {
    expect(
      assertCommonCrawlCdxApiUrl(
        "https://index.commoncrawl.org/CC-MAIN-2025-08-index/cdx"
      )
    ).toBe("https://index.commoncrawl.org/CC-MAIN-2025-08-index/cdx");
  });

  it("rejects CDX API URLs on untrusted hosts", () => {
    expect(() =>
      assertCommonCrawlCdxApiUrl("https://evil.test/CC-MAIN-2025-08-index/cdx")
    ).toThrow(/host not trusted/i);
  });

  it("rejects non-HTTPS CDX API URLs", () => {
    expect(() =>
      assertCommonCrawlCdxApiUrl(
        "http://index.commoncrawl.org/CC-MAIN-2025-08-index/cdx"
      )
    ).toThrow(/must use HTTPS/i);
  });
});
