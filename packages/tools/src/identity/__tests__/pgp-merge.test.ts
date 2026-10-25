import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseHkpMrIndex } from "../pgp-hkp";
import { keepKeysOnDomain, mergeServerKeys } from "../pgp-merge";

function keysOf(name: string) {
  return parseHkpMrIndex(
    readFileSync(
      path.join(import.meta.dirname, "..", "__fixtures__", name),
      "utf-8"
    )
  );
}

const NOW = Date.parse("2026-06-01T00:00:00.000Z");
const FP = "0D59D2B15144766A14D241C66BAF400B05C3E651";

describe("mergeServerKeys", () => {
  it("merges the same fingerprint across servers and unions the UIDs", () => {
    const merged = mergeServerKeys(
      [
        {
          host: "keyserver.ubuntu.com",
          keys: keysOf("pgp-hkp-ubuntu-debian-security.txt"),
        },
        {
          host: "pgpkeys.eu",
          keys: keysOf("pgp-hkp-pgpkeys-eu-debian-security.txt"),
        },
        {
          host: "keys.openpgp.org",
          keys: keysOf("pgp-hkp-hagrid-fingerprint.txt"),
        },
      ],
      NOW
    );
    expect(merged.map((key) => key.fingerprint)).toEqual([
      FP,
      "BACB4B5C30AC38F319EE961E2702CAEB90F8EEC5",
    ]);
    const [first, second] = merged;
    expect(first?.servers).toEqual([
      "keyserver.ubuntu.com",
      "pgpkeys.eu",
      "keys.openpgp.org",
    ]);
    // Both servers listed the same two UIDs: deduplicated, not doubled.
    expect(first?.uids.map((uid) => uid.email)).toEqual([
      "security@debian.org",
      "team@security.debian.org",
    ]);
    // Ubuntu returned no UIDs for the second key; pgpkeys.eu's three are kept.
    expect(second?.servers).toEqual(["keyserver.ubuntu.com", "pgpkeys.eu"]);
    expect(second?.uids).toHaveLength(3);
    expect(first?.keyId).toBe("6BAF400B05C3E651");
    // Expiry is blank on ubuntu and set on pgpkeys.eu: the date that is known wins.
    expect(first?.expires).toBe(new Date(1_818_962_128 * 1000).toISOString());
    expect(first?.algorithmName).toBe("RSA");
    expect(first?.bits).toBe(4096);
  });

  it("deduplicates UIDs ignoring case and spacing", () => {
    const [key] = mergeServerKeys(
      [
        {
          host: "a",
          keys: parseHkpMrIndex(
            "pub:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1:2048:1::\nuid:Ada <ada@example.com>:1::"
          ),
        },
        {
          host: "b",
          keys: parseHkpMrIndex(
            "pub:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1:2048:1::\nuid:ADA  <ada@example.com>:1::r"
          ),
        },
      ],
      NOW
    );
    expect(key?.uids).toHaveLength(1);
    // A revocation on one server is kept.
    expect(key?.uids[0]?.revoked).toBe(true);
  });

  it("never merges two fingerprints that share their last 8 or 16 digits", () => {
    const tail = "BBBBBBBBBBBBBBBB";
    const merged = mergeServerKeys(
      [
        {
          host: "a",
          keys: parseHkpMrIndex(
            `pub:${"1".repeat(24)}${tail}:1:2048:1::\nuid:One <one@example.com>:1::`
          ),
        },
        {
          host: "b",
          keys: parseHkpMrIndex(
            `pub:${"2".repeat(24)}${tail}:1:2048:1::\nuid:Two <two@example.com>:1::`
          ),
        },
      ],
      NOW
    );
    expect(merged).toHaveLength(2);
    expect(merged.map((key) => key.servers)).toEqual([["a"], ["b"]]);
  });

  it("joins a long key id to the one fingerprint that ends with it", () => {
    const merged = mergeServerKeys(
      [
        { host: "full", keys: keysOf("pgp-hkp-hagrid-fingerprint.txt") },
        {
          host: "idonly",
          keys: parseHkpMrIndex(
            "pub:6BAF400B05C3E651:1:4096:1421581556::\nuid:Debian <debian@example.com>:1::"
          ),
        },
      ],
      NOW
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.fingerprint).toBe(FP);
    expect(merged[0]?.servers).toEqual(["full", "idonly"]);
    expect(merged[0]?.uids.map((uid) => uid.email)).toEqual([
      "debian@example.com",
    ]);
  });

  it("keeps a long key id apart when two fingerprints end with it, or none does", () => {
    const tail = "BBBBBBBBBBBBBBBB";
    const ambiguous = mergeServerKeys(
      [
        {
          host: "a",
          keys: parseHkpMrIndex(
            `pub:${"1".repeat(24)}${tail}:1:2048:1::\npub:${"2".repeat(24)}${tail}:1:2048:1::`
          ),
        },
        { host: "b", keys: parseHkpMrIndex(`pub:${tail}:1:2048:1::`) },
        { host: "c", keys: parseHkpMrIndex(`pub:${tail}:1:2048:1::`) },
      ],
      NOW
    );
    expect(ambiguous).toHaveLength(3);
    const idOnly = ambiguous.find((key) => key.fingerprint === null);
    expect(idOnly?.keyId).toBe(tail);
    // Two servers returning the same id alone are the same key.
    expect(idOnly?.servers).toEqual(["b", "c"]);
  });

  it("never merges a short key id into a fingerprint", () => {
    const merged = mergeServerKeys(
      [
        { host: "full", keys: keysOf("pgp-hkp-hagrid-fingerprint.txt") },
        { host: "short", keys: parseHkpMrIndex("pub:05C3E651:1:4096:1::") },
      ],
      NOW
    );
    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({ fingerprint: null, keyId: "05C3E651" });
  });

  it("marks revoked and expired keys", () => {
    const keys = mergeServerKeys(
      [{ host: "a", keys: keysOf("pgp-hkp-flags.txt") }],
      NOW
    );
    const byId = new Map(
      keys.map((key) => [key.fingerprint ?? key.keyId, key])
    );
    // Past expiry date, and flagged.
    expect(byId.get("1".repeat(40))).toMatchObject({
      expired: true,
      revoked: false,
    });
    expect(byId.get("2".repeat(40))).toMatchObject({
      expired: false,
      revoked: true,
    });
    // A far-future expiry is not expired.
    expect(byId.get("5".repeat(40))).toMatchObject({
      expired: false,
      revoked: false,
    });
  });

  it("reads a key as expired from its date even when no server flags it, and revoked when only one server says so", () => {
    const [key] = mergeServerKeys(
      [
        {
          host: "a",
          keys: parseHkpMrIndex(`pub:${FP}:1:4096:1:1000000000:`),
        },
        { host: "b", keys: parseHkpMrIndex(`pub:${FP}:1:4096:1::r`) },
      ],
      NOW
    );
    expect(key).toMatchObject({ expired: true, revoked: true });
  });
});

describe("mergeServerKeys expiry flag", () => {
  it("trusts a server's expired flag when no server gave a date", () => {
    const [key] = mergeServerKeys(
      [{ host: "a", keys: parseHkpMrIndex(`pub:${FP}:1:4096:1::e`) }],
      NOW
    );
    expect(key).toMatchObject({ expires: null, expired: true });
  });
});

describe("keepKeysOnDomain", () => {
  const merged = mergeServerKeys(
    [{ host: "a", keys: keysOf("pgp-hkp-domain-keyword-match.txt") }],
    NOW
  );

  it("drops keys with no UID address on exactly the domain", () => {
    const kept = keepKeysOnDomain(merged, "example.com");
    // Ann (exact), Dee (upper case address); not Bob (subdomain) or Cy (keyword only).
    expect(kept.map((key) => key.fingerprint?.[0])).toEqual(["A", "D"]);
  });

  it("keeps all UIDs of a kept key, including ones on other domains", () => {
    const [ann] = keepKeysOnDomain(merged, "example.com");
    expect(ann?.uids.map((uid) => uid.email)).toEqual([
      "ann@example.com",
      "ann@example.org",
    ]);
  });

  it("matches the domain case-insensitively", () => {
    expect(keepKeysOnDomain(merged, "EXAMPLE.COM")).toHaveLength(2);
  });

  it("does not match a subdomain or a longer domain", () => {
    expect(
      keepKeysOnDomain(merged, "mail.example.com").map(
        (key) => key.fingerprint?.[0]
      )
    ).toEqual(["B"]);
    expect(keepKeysOnDomain(merged, "ample.com")).toEqual([]);
  });
});
