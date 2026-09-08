import { describe, it, expect } from "vitest";

import {
  claimText,
  expectProposesIdentifier,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { hibpLookup } from "../cap.ts";
import { interpretHibpLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    email: "bob@example.com",
    queriedAt: "2026-01-01T00:00:00.000Z",
    found: true,
    breachCount: 2,
    breaches: [
      {
        name: "Adobe",
        title: "Adobe",
        domain: "adobe.com",
        breachDate: "2013-10-04",
        pwnCount: 1,
        dataClasses: ["Email addresses", "Passwords"],
      },
      {
        name: "LinkedIn",
        title: "LinkedIn",
        domain: "linkedin.com",
        breachDate: "2012-05-05",
        pwnCount: 1,
        dataClasses: ["Email addresses"],
      },
    ],
    status: 200,
  };

  it("interpretHibpLookupReport proposes email Identifier + Claim", () => {
    const result = interpretHibpLookupReport(fixture, {
      input: { email: "bob@example.com", entityId },
    });
    expectProposesIdentifier(result, {
      type: "email",
      value: "bob@example.com",
    });
    expect(result.patch.length).toBe(2);
    expect(claimText(result, 1)).toMatch(/Adobe/);
    expect(claimText(result, 1)).toMatch(/LinkedIn/);
  });

  it("summarizes truncated breach samples with (+N more)", () => {
    const breaches = Array.from({ length: 15 }, (_, index) => ({
      name: `Breach${index}`,
      title: `Breach ${index}`,
      domain: "example.com",
      breachDate: "2020-01-01",
      pwnCount: 1,
      dataClasses: ["Email addresses"],
    }));
    const result = interpretHibpLookupReport(
      {
        ...fixture,
        breachCount: 15,
        breaches,
      },
      { input: { email: "bob@example.com", entityId } }
    );
    expect(claimText(result, 1)).toMatch(/15 breach\(es\)/);
    expect(claimText(result, 1)).toMatch(/\+3 more/);
  });

  itRejectsIncompleteReport(
    hibpLookup,
    { email: "a@b.com" },
    { email: "a@b.com" }
  );
});
