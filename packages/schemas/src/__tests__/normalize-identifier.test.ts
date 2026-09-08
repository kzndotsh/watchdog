import { describe, it, expect } from "vitest";

import { normalizeIdentifierValue } from "../normalize-identifier.ts";

describe("normalize-identifier", () => {
  it("normalizeIdentifierValue lowercases emails", () => {
    expect(normalizeIdentifierValue("email", "Bob@Example.COM")).toBe(
      "bob@example.com"
    );
  });

  it("normalizeIdentifierValue strips phone punctuation", () => {
    expect(normalizeIdentifierValue("phone", "+44 (0)20 7946 0958")).toBe(
      "+4402079460958"
    );
  });

  it("normalizeIdentifierValue strips tracking params from urls", () => {
    const out = normalizeIdentifierValue(
      "url",
      "https://Example.com/path?utm_source=x&keep=1#frag"
    );
    expect(out).toBe("https://example.com/path?keep=1");
  });

  it("normalizeIdentifierValue leaves handles verbatim", () => {
    expect(normalizeIdentifierValue("handle", "@Alice")).toBe("@Alice");
  });

  it("normalizeIdentifierValue canonicalizes domains", () => {
    expect(
      normalizeIdentifierValue("domain", "HTTPS://Api.Example.COM/path")
    ).toBe("api.example.com");
    expect(normalizeIdentifierValue("domain", "*.Example.COM.")).toBe(
      "example.com"
    );
  });

  it("normalizeIdentifierValue canonicalizes ips", () => {
    expect(normalizeIdentifierValue("ip", " 8.8.8.8 ")).toBe("8.8.8.8");
    expect(normalizeIdentifierValue("ip", "[2001:DB8::1]")).toBe("2001:db8::1");
    expect(
      normalizeIdentifierValue("ip", "2001:0db8:0000:0000:0000:0000:0000:0001")
    ).toBe("2001:db8::1");
  });

  it("normalizeIdentifierValue canonicalizes pgp fingerprints", () => {
    expect(
      normalizeIdentifierValue(
        "pgp",
        "a1b2 c3d4 e5f6 7890 abcd ef12 3456 7890 abcd ef12"
      )
    ).toBe("A1B2C3D4E5F67890ABCDEF1234567890ABCDEF12");
    expect(normalizeIdentifierValue("pgp", "A1B2:C3D4:E5F6:7890")).toBe(
      "A1B2C3D4E5F67890"
    );
    expect(
      normalizeIdentifierValue("pgp", "-----BEGIN PGP PUBLIC KEY BLOCK-----")
    ).toBe("-----BEGIN PGP PUBLIC KEY BLOCK-----");
  });
});
