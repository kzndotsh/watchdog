import { describe, it, expect } from "vitest";

import { testId } from "@watchdog/test-kit";

import { claimText, itRejectsIncompleteReport } from "../../../testing";
import { dehashedLookup } from "../cap.ts";
import { interpretDehashedLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    query: "victim@example.com",
    kind: "email" as const,
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "api.dehashed.com" as const,
    found: true,
    total: 3,
    balance: 9997,
    databases: ["breach-2019-dump", "combo-list-2021"],
    sampleCount: 2,
    credentialMode: "full" as const,
    reuse: [
      { role: "plaintext" as const, fingerprint: "ab".repeat(32), records: 3 },
    ],
    entries: [
      {
        databaseName: "breach-2019-dump",
        email: "victim@example.com",
        username: "victim",
        ipAddress: null,
        name: null,
        phone: null,
        password: "hunter2",
        hashedPassword: null,
      },
      {
        databaseName: "combo-list-2021",
        email: "victim@example.com",
        username: null,
        ipAddress: null,
        name: null,
        phone: null,
        password: null,
        hashedPassword: "deadbeef",
      },
    ],
  };

  it("interpretDehashedLookupReport proposes observation Claim naming credentials by kind and length, never by value", () => {
    const result = interpretDehashedLookupReport(fixture, {
      input: { query: fixture.query, entityId },
    });
    expect(result.patch.length).toBe(1);
    const text = claimText(result, 0);
    expect(text).toMatch(/DeHashed/);
    expect(text).toMatch(/3 record\(s\)/);
    expect(text).toMatch(/breach-2019-dump/);
    expect(text).toMatch(/password=plaintext, 7 chars/);
    expect(text).toMatch(/hash=unknown, 8 chars/);
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("deadbeef");
    expect(text).toMatch(
      /3 records share a password \(fingerprint abababab…\)/
    );
  });

  it("interpretDehashedLookupReport empty patch without entityId", () => {
    const result = interpretDehashedLookupReport(fixture, {
      input: { query: fixture.query },
    });
    expect(result.patch).toEqual([]);
  });

  itRejectsIncompleteReport(
    dehashedLookup,
    { query: "victim@example.com" },
    { query: "victim@example.com" }
  );
});
