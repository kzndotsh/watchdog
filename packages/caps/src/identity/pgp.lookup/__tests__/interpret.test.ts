import { describe, it, expect } from "vitest";

import { testId } from "@watchdog/test-kit";
import type { PgpKeyHit, PgpLookupSnapshot } from "@watchdog/tools/identity";

import {
  expectNoConfidenceOnPatch,
  expectProposesIdentifier,
  itRejectsIncompleteReport,
} from "../../../testing";
import { pgpLookup } from "../cap.ts";
import { interpretPgpLookupReport } from "../interpret.ts";

const FP_A = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const FP_B = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

function key(overrides: Partial<PgpKeyHit> = {}): PgpKeyHit {
  return {
    fingerprint: FP_A,
    keyId: FP_A.slice(-16),
    algorithm: 1,
    algorithmName: "RSA",
    bits: 4096,
    created: null,
    expires: null,
    revoked: false,
    expired: false,
    uids: [
      {
        text: "Alice <alice@example.com>",
        name: "Alice",
        email: "alice@example.com",
        revoked: false,
      },
    ],
    servers: ["keyserver.ubuntu.com"],
    ...overrides,
  };
}

function report(overrides: Partial<PgpLookupSnapshot> = {}): PgpLookupSnapshot {
  return {
    query: "alice@example.com",
    queryKind: "email",
    queriedAt: "2026-01-01T00:00:00.000Z",
    servers: [
      { host: "keyserver.ubuntu.com", status: "ok", keyCount: 1, detail: null },
      {
        host: "keys.openpgp.org",
        status: "timeout",
        keyCount: 0,
        detail: "no answer in 12000 ms",
      },
      {
        host: "pgp.mit.edu",
        status: "error",
        keyCount: 0,
        detail: "HTTP 500",
      },
    ],
    keys: [key()],
    ...overrides,
  };
}

const entityId = testId(1);

const identifiers = (result: ReturnType<typeof interpretPgpLookupReport>) =>
  result.patch.flatMap((op) =>
    op.resource === "identifier" &&
    typeof op.data.type === "string" &&
    typeof op.data.value === "string"
      ? [`${op.data.type}:${op.data.value}`]
      : []
  );

describe("interpret", () => {
  it("proposes the seed email, the key fingerprint and one Claim", () => {
    const result = interpretPgpLookupReport(report(), {
      input: { query: "alice@example.com", entityId },
    });
    expectProposesIdentifier(result, {
      type: "email",
      value: "alice@example.com",
    });
    expectProposesIdentifier(result, { type: "pgp", value: FP_A });
    expect(result.patch).toHaveLength(3);
    expect(result.patch.at(-1)).toMatchObject({
      resource: "claim",
      data: { class: "observation" },
    });
    expectNoConfidenceOnPatch(result);
  });

  it("proposes the email addresses in the User IDs, deduplicated", () => {
    const result = interpretPgpLookupReport(
      report({
        keys: [
          key({
            uids: [
              {
                text: "Alice <alice@example.com>",
                name: "Alice",
                email: "alice@example.com",
                revoked: false,
              },
              {
                text: "Alice <alice@work.example.org>",
                name: "Alice",
                email: "alice@work.example.org",
                revoked: false,
              },
              { text: "Alice", name: "Alice", email: null, revoked: false },
            ],
          }),
          key({
            fingerprint: FP_B,
            keyId: FP_B.slice(-16),
            uids: [
              {
                text: "A <alice@work.example.org>",
                name: "A",
                email: "alice@work.example.org",
                revoked: false,
              },
            ],
          }),
        ],
      }),
      { input: { query: "alice@example.com", entityId } }
    );
    expect(identifiers(result)).toEqual([
      "email:alice@example.com",
      "email:alice@work.example.org",
      `pgp:${FP_A}`,
      `pgp:${FP_B}`,
    ]);
  });

  it("proposes a key id when no server gave a fingerprint", () => {
    const result = interpretPgpLookupReport(
      report({
        keys: [key({ fingerprint: null, keyId: "6BAF400B05C3E651" })],
      }),
      { input: { query: "alice@example.com", entityId } }
    );
    expectProposesIdentifier(result, {
      type: "pgp",
      value: "6BAF400B05C3E651",
    });
  });

  it("keeps revoked and expired keys as Identifiers and names them in the Claim", () => {
    const result = interpretPgpLookupReport(
      report({
        keys: [
          key({ revoked: true }),
          key({ fingerprint: FP_B, keyId: FP_B.slice(-16), expired: true }),
        ],
      }),
      { input: { query: "alice@example.com", entityId } }
    );
    expectProposesIdentifier(result, { type: "pgp", value: FP_A });
    expectProposesIdentifier(result, { type: "pgp", value: FP_B });
    const summary = String(result.summary);
    expect(summary).toContain(`revoked: ${FP_A}`);
    expect(summary).toContain(`expired: ${FP_B}`);
  });

  it("states a partial failure in the Claim", () => {
    const result = interpretPgpLookupReport(report(), {
      input: { query: "alice@example.com", entityId },
    });
    expect(String(result.summary)).toContain(
      "1 of 3 keyservers answered; keys.openpgp.org timeout, pgp.mit.edu error"
    );
  });

  it("does not count a skipped server as asked", () => {
    const result = interpretPgpLookupReport(
      report({
        queryKind: "name",
        query: "Alice",
        servers: [
          { host: "pgpkeys.eu", status: "ok", keyCount: 1, detail: null },
          {
            host: "keys.openpgp.org",
            status: "skipped",
            keyCount: 0,
            detail: "unsupported query kind: name",
          },
        ],
      }),
      { input: { query: "Alice", entityId } }
    );
    expect(String(result.summary)).toContain("1 of 1 keyservers answered");
  });

  it("proposes the queried domain, and no seed for a name", () => {
    const domain = interpretPgpLookupReport(
      report({ query: "example.com", queryKind: "domain" }),
      { input: { query: "example.com", entityId } }
    );
    expectProposesIdentifier(domain, { type: "domain", value: "example.com" });
    const name = interpretPgpLookupReport(
      report({ query: "Alice Example", queryKind: "name" }),
      { input: { query: "Alice Example", entityId } }
    );
    expect(identifiers(name)).toEqual([
      "email:alice@example.com",
      `pgp:${FP_A}`,
    ]);
  });

  it("notes truncated pgp keys in the Claim when over 20", () => {
    const keys = Array.from({ length: 25 }, (_, i) =>
      key({
        fingerprint: String(i).padStart(40, "A"),
        keyId: String(i).padStart(16, "A"),
        uids: [],
      })
    );
    const result = interpretPgpLookupReport(report({ keys }), {
      input: { query: "alice@example.com", entityId },
    });
    expect(String(result.summary)).toMatch(/showing 20 of 25 in Identifiers/);
    const pgps = result.patch.filter(
      (p) => p.resource === "identifier" && p.data.type === "pgp"
    );
    expect(pgps).toHaveLength(20);
  });

  it("proposes the fingerprint seed when no keys are returned", () => {
    const result = interpretPgpLookupReport(
      report({ query: FP_A, queryKind: "fingerprint", keys: [] }),
      { input: { query: FP_A, entityId } }
    );
    expectProposesIdentifier(result, { type: "pgp", value: FP_A });
  });

  itRejectsIncompleteReport(pgpLookup, { query: "x" }, { query: "x" });
});
