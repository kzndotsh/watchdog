import { describe, expect, it } from "vitest";

import {
  claimText,
  expectNoConfidenceOnPatch,
  expectProposesIdentifier,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { gravatarLookup } from "../cap.ts";
import { interpretGravatarLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    email: "support@gravatar.com",
    hash: "84991830db6f88ce9a6d4e181a1e763c",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "secure.gravatar.com" as const,
    found: true,
    displayName: "Gravatar",
    preferredUsername: "gravatar",
    profileUrl: "https://gravatar.com/gravatar",
    location: null,
    aboutMe: null,
    emails: ["support@gravatar.com"],
    accounts: [
      {
        shortname: "twitter",
        url: "https://twitter.com/gravatar",
        username: "gravatar",
      },
    ],
  };

  it("proposes email, handles, and profile/account URLs", () => {
    const result = interpretGravatarLookupReport(fixture, {
      input: { email: "support@gravatar.com", entityId },
    });
    expectProposesIdentifier(result, {
      type: "email",
      value: "support@gravatar.com",
    });
    expectProposesIdentifier(result, { type: "handle", value: "gravatar" });
    expectProposesIdentifier(result, {
      type: "url",
      value: "https://gravatar.com/gravatar",
    });
    expectProposesIdentifier(result, {
      type: "url",
      value: "https://twitter.com/gravatar",
    });
    expect(result.patch.some((p) => p.resource === "claim")).toBeTruthy();
    expectNoConfidenceOnPatch(result);
  });

  it("miss is Claim + seed email only", () => {
    const result = interpretGravatarLookupReport(
      { ...fixture, found: false, profileUrl: null, emails: [], accounts: [] },
      { input: { email: fixture.email, entityId } }
    );
    const ids = result.patch.filter((p) => p.resource === "identifier");
    expect(ids).toHaveLength(1);
    expect(ids[0]?.data.type).toBe("email");
    expect(claimText(result, 1)).toMatch(/no public profile/);
  });

  it("notes truncated handle batch when over 40", () => {
    const accounts = Array.from({ length: 42 }, (_, i) => ({
      shortname: "web",
      url: `https://site-${i}.example.com/p`,
      username: `user-${i}`,
    }));
    const result = interpretGravatarLookupReport(
      { ...fixture, accounts },
      { input: { email: fixture.email, entityId } }
    );
    expect(String(result.summary)).toMatch(/showing 40 of 43 handles/);
    const handles = result.patch.filter(
      (p) => p.resource === "identifier" && p.data.type === "handle"
    );
    expect(handles).toHaveLength(40);
  });

  it("notes truncated URL batch when over 40", () => {
    const accounts = Array.from({ length: 41 }, (_, i) => ({
      shortname: "web",
      url: `https://site-${i}.example.com/p`,
      username: null,
    }));
    const result = interpretGravatarLookupReport(
      { ...fixture, accounts },
      { input: { email: fixture.email, entityId } }
    );
    expect(String(result.summary)).toMatch(/showing 40 of 42 urls/);
    const urls = result.patch.filter(
      (p) => p.resource === "identifier" && p.data.type === "url"
    );
    expect(urls).toHaveLength(40);
  });

  itRejectsIncompleteReport(
    gravatarLookup,
    { email: "a@b.com" },
    { email: "a@b.com" }
  );
});
