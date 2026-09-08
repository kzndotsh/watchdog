import { describe, it, expect } from "vitest";

import {
  expectNoConfidenceOnPatch,
  expectProposesIdentifier,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { pgpLookup } from "../cap.ts";
import { interpretPgpLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    query: "alice@example.com",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "https://keys.openpgp.org",
    keys: [
      {
        fingerprint: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        uids: ["Alice <alice@example.com>"],
        created: null,
        expires: null,
      },
    ],
  };

  it("interpretPgpLookupReport proposes pgp Identifier + Claim", () => {
    const result = interpretPgpLookupReport(fixture, {
      input: { query: "alice@example.com", entityId },
    });
    expectProposesIdentifier(result, {
      type: "email",
      value: "alice@example.com",
    });
    expectProposesIdentifier(result, {
      type: "pgp",
      value: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    });
    expect(result.patch.length).toBe(3);
    expectNoConfidenceOnPatch(result);
  });

  it("notes truncated pgp keys in claim when over 20", () => {
    const keys = Array.from({ length: 25 }, (_, i) => ({
      fingerprint: String(i).padStart(40, "A"),
      uids: [],
      created: null,
      expires: null,
    }));
    const result = interpretPgpLookupReport(
      { ...fixture, keys },
      { input: { query: "alice@example.com", entityId } }
    );
    expect(String(result.summary)).toMatch(/showing 20 of 25 in Identifiers/);
    const pgps = result.patch.filter(
      (p) => p.resource === "identifier" && p.data.type === "pgp"
    );
    expect(pgps).toHaveLength(20);
  });

  it("proposes fingerprint seed when no keys are returned", () => {
    const fingerprint = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const result = interpretPgpLookupReport(
      { ...fixture, query: fingerprint, keys: [] },
      { input: { query: fingerprint, entityId } }
    );
    expectProposesIdentifier(result, { type: "pgp", value: fingerprint });
  });

  itRejectsIncompleteReport(pgpLookup, { query: "x" }, { query: "x" });
});
