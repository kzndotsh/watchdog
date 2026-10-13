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

  describe("domain normalization", () => {
    const domain = (v: string) => normalizeIdentifierValue("domain", v);

    it("drops scheme, path and query, lowercases", () => {
      expect(domain("https://Example.com/path?x=1")).toBe("example.com");
      expect(domain("http://Example.com")).toBe("example.com");
    });

    it("strips one trailing dot and a leading wildcard", () => {
      expect(domain("example.com.")).toBe("example.com");
      expect(domain("https://example.com./a")).toBe("example.com");
      expect(domain("*.Example.com")).toBe("example.com");
    });

    it("handles only-slashes and empty-path inputs", () => {
      expect(domain("/")).toBe("");
      expect(domain("////")).toBe("");
      expect(domain("example.com/")).toBe("example.com");
      expect(domain("https:///x")).toBe("");
    });

    it("keeps legacy output when the input spans lines", () => {
      // `.` never matched a line terminator, so a slash followed by a later
      // newline was not cut.
      expect(domain("Example.com/a\nb")).toBe("example.com/a\nb");
      expect(domain("a\nExample.com/x")).toBe("a\nexample.com");
    });

    it("stays linear on a long run of slashes followed by a newline", () => {
      const hostile = `${"/".repeat(100_000)}\n!`;
      const start = performance.now();
      domain(hostile);
      expect(performance.now() - start).toBeLessThan(500);
    });
  });
});
