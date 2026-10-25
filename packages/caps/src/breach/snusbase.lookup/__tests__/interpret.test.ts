import { describe, it, expect } from "vitest";

import { testId } from "@watchdog/test-kit";

import { claimText, itRejectsIncompleteReport } from "../../../testing";
import { snusbaseLookup } from "../cap.ts";
import { interpretSnusbaseLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    query: "victim@example.com",
    kind: "email" as const,
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "api.snusbase.com" as const,
    found: true,
    total: 42,
    tables: [
      { name: "breach_2020", count: 30 },
      { name: "combo_2022", count: 12 },
    ],
    sampleCount: 2,
    credentialMode: "full" as const,
    reuse: [
      { role: "plaintext" as const, fingerprint: "ab".repeat(32), records: 3 },
    ],
    entries: [
      {
        table: "breach_2020",
        email: "victim@example.com",
        username: "victim",
        password: "hunter2",
        hash: null,
        lastip: null,
        name: null,
        host: null,
        domain: null,
      },
      {
        table: "combo_2022",
        email: "victim@example.com",
        username: null,
        password: null,
        hash: "deadbeef",
        lastip: "1.2.3.4",
        name: null,
        host: null,
        domain: null,
      },
    ],
  };

  it("interpretSnusbaseLookupReport proposes observation Claim naming credentials by kind and length, never by value", () => {
    const result = interpretSnusbaseLookupReport(fixture, {
      input: { query: fixture.query, entityId },
    });
    expect(result.patch.length).toBe(1);
    const text = claimText(result, 0);
    expect(text).toMatch(/Snusbase/);
    expect(text).toMatch(/42 record\(s\)/);
    expect(text).toMatch(/breach_2020/);
    expect(text).toMatch(/password=plaintext, 7 chars/);
    expect(text).toMatch(/hash=unknown, 8 chars/);
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("deadbeef");
    expect(text).toMatch(
      /3 records share a password \(fingerprint abababab…\)/
    );
  });

  it("interpretSnusbaseLookupReport empty patch without entityId", () => {
    const result = interpretSnusbaseLookupReport(fixture, {
      input: { query: fixture.query },
    });
    expect(result.patch).toEqual([]);
  });

  itRejectsIncompleteReport(
    snusbaseLookup,
    { query: "victim@example.com" },
    { query: "victim@example.com" }
  );
});
