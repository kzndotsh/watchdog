import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { urlhausLookup } from "../cap.ts";
import { interpretUrlhausLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    query: "http://evil.example/bad.exe",
    kind: "url" as const,
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "urlhaus-api.abuse.ch" as const,
    queryStatus: "ok",
    found: true,
    threat: "malware_download",
    urlStatus: "online",
    tags: ["exe", "emotet"],
    urlhausReference: "https://urlhaus.abuse.ch/url/12345/",
    firstSeen: "2026-01-01 00:00:00",
  };

  it("interpretUrlhausLookupReport proposes url Identifier + Claim on a URL hit", () => {
    const result = interpretUrlhausLookupReport(fixture, {
      input: { query: fixture.query, entityId },
    });
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("url");
    expect(claimText(result, 1)).toMatch(/URLhaus/);
    expect(claimText(result, 1)).toMatch(/malware_download/);
  });

  it("interpretUrlhausLookupReport proposes domain Identifier on a host hit", () => {
    const result = interpretUrlhausLookupReport(
      {
        ...fixture,
        query: "evil.example",
        kind: "host",
      },
      { input: { query: "evil.example", entityId } }
    );
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("domain");
    expect(result.patch[0]?.data.value).toBe("evil.example");
  });

  it("interpretUrlhausLookupReport proposes seed url Identifier when no hit", () => {
    const result = interpretUrlhausLookupReport(
      { ...fixture, found: false, threat: null, urlStatus: null, tags: [] },
      { input: { query: fixture.query, entityId } }
    );
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("url");
    expect(result.patch[0]?.data.value).toBe(fixture.query);
  });

  it("interpretUrlhausLookupReport proposes ip Identifier for host-kind IP queries", () => {
    const result = interpretUrlhausLookupReport(
      {
        ...fixture,
        query: "198.51.100.1",
        kind: "host",
        found: false,
        threat: null,
        urlStatus: null,
        tags: [],
      },
      { input: { query: "198.51.100.1", entityId } }
    );
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("ip");
    expect(result.patch[0]?.data.value).toBe("198.51.100.1");
  });

  it("interpretUrlhausLookupReport proposes hash seed as other Identifier", () => {
    const hash = "a".repeat(64);
    const result = interpretUrlhausLookupReport(
      {
        ...fixture,
        query: hash,
        kind: "hash",
        found: false,
        threat: null,
        urlStatus: null,
        tags: [],
      },
      { input: { query: hash, entityId } }
    );
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("other");
    expect(result.patch[0]?.data.value).toBe(hash);
  });

  itRejectsIncompleteReport(
    urlhausLookup,
    { query: fixture.query },
    { query: fixture.query }
  );
});
