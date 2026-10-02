import { describe, it, expect } from "vitest";

import { testId } from "@watchdog/test-kit";

import { claimText, itRejectsIncompleteReport } from "../../../testing";
import { emailLookup } from "../cap.ts";
import { interpretEmailLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    email: "bob@gmail.com",
    domain: "gmail.com",
    queriedAt: "2026-01-01T00:00:00.000Z",
    providerHint: "google",
    mx: [{ exchange: "gmail-smtp-in.l.google.com", priority: 5 }],
    spfPresent: true,
    dmarcPresent: true,
  };

  it("interpretEmailLookupReport proposes email + domain + Claim", () => {
    const result = interpretEmailLookupReport(fixture, {
      input: { email: "bob@gmail.com", entityId },
    });
    expect(result.patch.length).toBe(3);
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("email");
    expect(result.patch[1]?.resource).toBe("identifier");
    expect(result.patch[1]?.data.type).toBe("domain");
    expect(result.patch[2]?.resource).toBe("claim");
    expect(claimText(result, 2)).toMatch(/provider=google/);
  });

  itRejectsIncompleteReport(
    emailLookup,
    { email: "a@b.com" },
    { email: "a@b.com" }
  );
});
