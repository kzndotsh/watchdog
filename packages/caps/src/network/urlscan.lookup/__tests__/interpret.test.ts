import { describe, it, expect } from "vitest";

import { testId } from "@watchdog/test-kit";

import {
  expectNoConfidenceOnPatch,
  itRejectsIncompleteReport,
} from "../../../testing";
import { urlscanLookup } from "../cap.ts";
import { interpretUrlscanLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    host: "example.com",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "urlscan.io/api/v1/search" as const,
    total: 2,
    urls: ["https://example.com/", "https://www.example.com/"],
    domains: ["example.com", "www.example.com"],
    hits: [
      {
        uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        url: "https://example.com/",
        domain: "example.com",
        ip: "93.184.216.34",
        country: "US",
        server: null,
        asn: "AS15133",
        asnName: "EDGECAST",
        ptr: null,
        scannedAt: "2026-01-01T00:00:00.000Z",
        resultUrl:
          "https://urlscan.io/api/v1/result/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/",
      },
    ],
  };

  it("interpretUrlscanLookupReport proposes url + domain Identifiers", () => {
    const result = interpretUrlscanLookupReport(fixture, {
      input: { host: "example.com", entityId },
    });
    const urls = result.patch.filter(
      (p) => p.resource === "identifier" && p.data.type === "url"
    );
    const domains = result.patch.filter(
      (p) => p.resource === "identifier" && p.data.type === "domain"
    );
    expect(urls.length).toBe(2);
    expect(domains.length).toBe(2);
    expect(result.patch.at(-1)?.resource).toBe("claim");
    expectNoConfidenceOnPatch(result);
  });

  itRejectsIncompleteReport(
    urlscanLookup,
    { host: "example.com" },
    { host: "example.com" }
  );
});
