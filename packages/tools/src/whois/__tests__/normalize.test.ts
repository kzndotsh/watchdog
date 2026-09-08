import { describe, expect, it } from "vitest";

import { normalizeHost } from "../normalize.ts";

describe("normalizeHost", () => {
  it("strips scheme, path, and trailing dot", () => {
    expect(normalizeHost("https://MailHost.test./path")).toBe("mailhost.test");
  });

  it("strips numeric ports from hostnames", () => {
    expect(normalizeHost("example.com:443")).toBe("example.com");
    expect(normalizeHost("https://example.com:8443/path")).toBe("example.com");
  });

  it("strips numeric ports from bracketed IPv6 hosts", () => {
    expect(normalizeHost("[2001:db8::1]:443")).toBe("[2001:db8::1]");
    expect(normalizeHost("https://[2001:db8::1]:8443/")).toBe("[2001:db8::1]");
  });

  it("keeps colons that are not a trailing numeric port", () => {
    expect(normalizeHost("2001:db8::1")).toBe("2001:db8::1");
    expect(normalizeHost("host:notaport")).toBe("host:notaport");
  });
});
