import { describe, expect, it } from "vitest";

import { pgpQuerySeedSchema } from "../cap-seed";
import { classifyPgpQuery } from "../pgp-query";

const FINGERPRINT = "0D59D2B15144766A14D241C66BAF400B05C3E651";
const V6 = "AB12CD34EF56AB12CD34EF56AB12CD34EF56AB12CD34EF56AB12CD34EF56AB12";

describe("classifyPgpQuery", () => {
  it.each([
    ["  Ada@Example.COM ", "email", "ada@example.com"],
    ["ada+tag@mail.example.co.uk", "email", "ada+tag@mail.example.co.uk"],
    ["example.com", "domain", "example.com"],
    ["@Example.com", "domain", "example.com"],
    ["mail.example.co.uk", "domain", "mail.example.co.uk"],
    ["6baf400b05c3e651", "key_id", "6BAF400B05C3E651"],
    ["0x6BAF400B05C3E651", "key_id", "6BAF400B05C3E651"],
    ["05C3E651", "key_id", "05C3E651"],
    [FINGERPRINT.toLowerCase(), "fingerprint", FINGERPRINT],
    [`0X${FINGERPRINT}`, "fingerprint", FINGERPRINT],
    [
      "0D59 D2B1 5144 766A 14D2  41C6 6BAF 400B 05C3 E651",
      "fingerprint",
      FINGERPRINT,
    ],
    [V6.toLowerCase(), "fingerprint", V6],
    [`0x${V6}`, "fingerprint", V6],
    [V6.replaceAll(/(.{8})/g, "$1 ").trim(), "fingerprint", V6],
    [V6.replaceAll(/(.{4})/g, "$1:").slice(0, -1), "fingerprint", V6],
    ["Ada Lovelace", "name", "Ada Lovelace"],
    ["  Ada   Lovelace ", "name", "Ada Lovelace"],
    ["Ada", "name", "Ada"],
    ["José Núñez", "name", "José Núñez"],
    ["O'Brien-Smith Jr.", "name", "O'Brien-Smith Jr."],
  ])("%j is a %s", (raw, kind, value) => {
    expect(classifyPgpQuery(raw)).toEqual({ kind, value });
  });

  it.each([
    "",
    "   ",
    "@",
    "ada@",
    "@ada",
    "ada@example",
    "Ada <ada@example.com>",
    "a@b@example.com",
    "https://example.com/path",
    "example.com:11371",
    "12345",
    "1.2.3.4",
    "Al",
    "deadbeef12",
    V6.slice(0, 63),
    `${V6}A`,
    "0x0D59D2B15144766A14D241C66BAF400B05C3E65",
    "ada;DROP TABLE",
    "ada&op=get",
    "x".repeat(101),
  ])("%j is refused", (raw) => {
    expect(classifyPgpQuery(raw)).toBeNull();
  });

  it("settles the ambiguous edges", () => {
    // Hex of 8 or 16 characters is a key id even when it reads like a word.
    expect(classifyPgpQuery("deadbeef")?.kind).toBe("key_id");
    // A short hex word is a name.
    expect(classifyPgpQuery("face")?.kind).toBe("name");
    // A dotted word with no spaces is a hostname.
    expect(classifyPgpQuery("j.smith")?.kind).toBe("domain");
    // The same with a space is a name.
    expect(classifyPgpQuery("J. Smith")?.kind).toBe("name");
    // Separated groups only count for a 40 character fingerprint.
    expect(classifyPgpQuery("dead beef")?.kind).toBe("name");
  });

  it("is stable: a normalized value classifies to itself", () => {
    for (const raw of [
      "Ada@Example.com",
      "@Example.com",
      "0x6baf400b05c3e651",
      FINGERPRINT.toLowerCase(),
      " Ada   Lovelace ",
    ]) {
      const first = classifyPgpQuery(raw);
      expect(first).not.toBeNull();
      expect(classifyPgpQuery(first?.value ?? "")).toEqual(first);
    }
  });
});

describe("pgpQuerySeedSchema", () => {
  it("returns the normalized value of every kind", () => {
    expect(pgpQuerySeedSchema.parse(" Ada@Example.com ")).toBe(
      "ada@example.com"
    );
    expect(pgpQuerySeedSchema.parse("@Example.com")).toBe("example.com");
    expect(pgpQuerySeedSchema.parse("0x6baf400b05c3e651")).toBe(
      "6BAF400B05C3E651"
    );
    expect(pgpQuerySeedSchema.parse("Ada  Lovelace")).toBe("Ada Lovelace");
  });

  it("rejects what no kind accepts", () => {
    expect(() => pgpQuerySeedSchema.parse("ada@")).toThrow();
    expect(() => pgpQuerySeedSchema.parse("12345")).toThrow();
  });
});
