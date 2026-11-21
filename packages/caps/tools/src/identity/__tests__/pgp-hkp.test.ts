import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseHkpMrIndex, parseUid } from "../pgp-hkp";

function fixture(name: string): string {
  return readFileSync(
    path.join(import.meta.dirname, "..", "__fixtures__", name),
    "utf-8"
  );
}

describe("parseHkpMrIndex", () => {
  it("reads a recorded keyserver.ubuntu.com index", () => {
    const keys = parseHkpMrIndex(fixture("pgp-hkp-ubuntu-debian-security.txt"));
    expect(keys.map((key) => key.id)).toEqual([
      "0D59D2B15144766A14D241C66BAF400B05C3E651",
      "BACB4B5C30AC38F319EE961E2702CAEB90F8EEC5",
    ]);
    const [first] = keys;
    expect(first).toMatchObject({
      algorithm: 1,
      bits: 4096,
      created: new Date(1_421_581_556 * 1000).toISOString(),
      expires: null,
      revoked: false,
      expiredFlag: false,
    });
    expect(first?.uids.map((uid) => uid.email)).toEqual([
      "security@debian.org",
      "team@security.debian.org",
    ]);
    expect(first?.uids[0]?.name).toBe("Debian Security Team");
  });

  it("reads expiry from a recorded pgpkeys.eu index", () => {
    const keys = parseHkpMrIndex(
      fixture("pgp-hkp-pgpkeys-eu-debian-security.txt")
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]?.expires).toBe(new Date(1_818_962_128 * 1000).toISOString());
    expect(keys[1]?.uids).toHaveLength(3);
  });

  it("reads a Hagrid index that has a key and no User IDs", () => {
    const keys = parseHkpMrIndex(fixture("pgp-hkp-hagrid-fingerprint.txt"));
    expect(keys).toHaveLength(1);
    expect(keys[0]?.uids).toEqual([]);
  });

  it("reads nothing from a not-found body", () => {
    expect(parseHkpMrIndex(fixture("pgp-hkp-hagrid-email-404.txt"))).toEqual(
      []
    );
    expect(parseHkpMrIndex(fixture("pgp-hkp-mailvelope-404.txt"))).toEqual([]);
  });

  it("reads revoked and expired flags, ids of every length and escaped UIDs", () => {
    const keys = parseHkpMrIndex(fixture("pgp-hkp-flags.txt"));
    const [expired, revoked, longId, shortId, future] = keys;
    expect(expired).toMatchObject({ expiredFlag: true, revoked: false });
    expect(expired?.uids[0]).toMatchObject({
      text: "Old Expired Key <old@example.com>",
      email: "old@example.com",
      name: "Old Expired Key",
    });
    expect(revoked).toMatchObject({
      revoked: true,
      expiredFlag: false,
      algorithm: 22,
      bits: 255,
    });
    expect(revoked?.uids[0]?.revoked).toBe(true);
    expect(revoked?.uids[1]?.revoked).toBe(false);
    // The address is lowercased, the display text kept as published.
    expect(revoked?.uids[1]?.email).toBe("mallory@corp.example.com");
    expect(longId?.id).toBe("3333333333333333");
    expect(shortId?.id).toBe("44444444");
    expect(future?.expires).toBe(new Date(4_102_444_800 * 1000).toISOString());
    expect(future?.expiredFlag).toBe(false);
  });

  it("skips a pub line with an id that is no key id or fingerprint, with its UIDs", () => {
    const keys = parseHkpMrIndex(
      [
        "pub:NOTHEX:1:2048:1262304000::",
        "uid:Stray <stray@example.com>:1262304000::",
        "pub:AAAAAAAAAAAAAAAA:1:2048:1262304000::",
        "uid:Kept <kept@example.com>:1262304000::",
      ].join("\n")
    );
    expect(keys).toHaveLength(1);
    expect(keys[0]?.uids.map((uid) => uid.email)).toEqual(["kept@example.com"]);
  });

  it("keeps an unescaped colon inside a UID", () => {
    const [key] = parseHkpMrIndex(
      "pub:AAAAAAAAAAAAAAAA:1:2048:1::\nuid:Re: Ada <ada@example.com>:1::"
    );
    expect(key?.uids[0]?.text).toBe("Re: Ada <ada@example.com>");
  });
});

describe("parseUid", () => {
  it.each([
    ["Ada <Ada@Example.com>", "Ada", "ada@example.com"],
    ["<ada@example.com>", null, "ada@example.com"],
    ["ada@example.com", null, "ada@example.com"],
    ["Ada Lovelace", "Ada Lovelace", null],
    ["Ada (work) <ada@example.com>", "Ada (work)", "ada@example.com"],
  ])("%j", (text, name, email) => {
    expect(parseUid(text, false)).toEqual({
      text,
      name,
      email,
      revoked: false,
    });
  });
});
