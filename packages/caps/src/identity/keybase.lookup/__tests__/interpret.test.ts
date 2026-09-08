import { describe, expect, it } from "vitest";

import {
  expectNoConfidenceOnPatch,
  expectProposesIdentifier,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { keybaseLookup } from "../cap.ts";
import { interpretKeybaseLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    query: "chris",
    kind: "username" as const,
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "keybase.io/_/api/1.0/user/lookup" as const,
    found: true,
    username: "chris",
    fullName: "Chris Coyne",
    bio: "bio",
    location: null,
    profileUrl: "https://keybase.io/chris",
    proofs: [
      {
        platform: "github",
        username: "malgorithms",
        url: "https://github.com/malgorithms",
      },
    ],
    pgpFingerprints: ["aabbccddeeff00112233445566778899aabbccdd"],
    bitcoinAddresses: [],
    extraUsernames: [],
  };

  it("proposes handle, pgp, profile/proof URLs + Claim", () => {
    const result = interpretKeybaseLookupReport(fixture, {
      input: { query: "chris", entityId },
    });
    expectProposesIdentifier(result, { type: "handle", value: "chris" });
    expectProposesIdentifier(result, {
      type: "pgp",
      value: "AABBCCDDEEFF00112233445566778899AABBCCDD",
    });
    expectProposesIdentifier(result, {
      type: "url",
      value: "https://keybase.io/chris",
    });
    expectProposesIdentifier(result, {
      type: "url",
      value: "https://github.com/malgorithms",
    });
    expect(result.patch.some((p) => p.resource === "claim")).toBeTruthy();
    expectNoConfidenceOnPatch(result);
  });

  it("lands username query as handle Identifier when not found", () => {
    const result = interpretKeybaseLookupReport(
      {
        ...fixture,
        found: false,
        username: null,
        profileUrl: null,
        proofs: [],
        pgpFingerprints: [],
      },
      { input: { query: "chris", entityId } }
    );
    expectProposesIdentifier(result, { type: "handle", value: "chris" });
    const urls = result.patch.filter(
      (p) => p.resource === "identifier" && p.data.type === "url"
    );
    expect(urls).toHaveLength(0);
  });

  it("lands domain query as domain Identifier", () => {
    const result = interpretKeybaseLookupReport(
      {
        ...fixture,
        query: "keybase.io",
        kind: "domain",
        found: false,
        username: null,
        profileUrl: null,
        proofs: [],
        pgpFingerprints: [],
      },
      { input: { query: "keybase.io", entityId } }
    );
    expectProposesIdentifier(result, { type: "domain", value: "keybase.io" });
    const urls = result.patch.filter(
      (p) => p.resource === "identifier" && p.data.type === "url"
    );
    expect(urls).toHaveLength(0);
  });

  itRejectsIncompleteReport(
    keybaseLookup,
    { query: "chris" },
    { query: "chris" }
  );
});
