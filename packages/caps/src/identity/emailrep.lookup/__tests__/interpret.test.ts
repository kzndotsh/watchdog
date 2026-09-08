import { describe, expect, it } from "vitest";

import {
  claimText,
  expectProposesIdentifier,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { emailrepLookup } from "../cap.ts";
import { interpretEmailrepLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    email: "bill@microsoft.com",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "emailrep.io" as const,
    found: true,
    reputation: "high",
    suspicious: false,
    references: 79,
    credentialsLeaked: true,
    maliciousActivity: false,
    dataBreach: true,
    profiles: ["twitter"],
    firstSeen: "07/01/07",
    lastSeen: "07/01/23",
    disposable: false,
    freeProvider: false,
    spoofable: false,
  };

  it("proposes seed email and Claim with flags + seen dates", () => {
    const result = interpretEmailrepLookupReport(fixture, {
      input: { email: fixture.email, entityId },
    });
    expectProposesIdentifier(result, {
      type: "email",
      value: "bill@microsoft.com",
    });
    expect(claimText(result, 1)).toMatch(/EmailRep/);
    expect(claimText(result, 1)).toMatch(/reputation=high/);
    expect(claimText(result, 1)).toMatch(/firstSeen=07\/01\/07/);
    expect(claimText(result, 1)).toMatch(/lastSeen=07\/01\/23/);
    expect(claimText(result, 1)).toMatch(/profiles=twitter/);
    const handles = result.patch.filter(
      (p) => p.resource === "identifier" && p.data.type === "handle"
    );
    expect(handles).toHaveLength(0);
  });

  it("summarizes reputation=none with zero references as found", () => {
    const result = interpretEmailrepLookupReport(
      {
        ...fixture,
        email: "bsheffield432@gmail.com",
        found: true,
        reputation: "none",
        suspicious: true,
        references: 0,
        credentialsLeaked: false,
        dataBreach: false,
        profiles: [],
        firstSeen: "never",
        lastSeen: "never",
        freeProvider: true,
        spoofable: true,
      },
      { input: { email: "bsheffield432@gmail.com", entityId } }
    );
    expectProposesIdentifier(result, {
      type: "email",
      value: "bsheffield432@gmail.com",
    });
    expect(claimText(result, 1)).toMatch(/reputation=none/);
    expect(claimText(result, 1)).not.toMatch(/no record/);
  });

  it("miss still lands seed email", () => {
    const result = interpretEmailrepLookupReport(
      { ...fixture, found: false, reputation: null, references: null },
      { input: { email: fixture.email, entityId } }
    );
    expectProposesIdentifier(result, {
      type: "email",
      value: "bill@microsoft.com",
    });
    expect(claimText(result, 1)).toMatch(/no record/);
  });

  itRejectsIncompleteReport(
    emailrepLookup,
    { email: "bill@microsoft.com" },
    { email: "bill@microsoft.com" }
  );
});
