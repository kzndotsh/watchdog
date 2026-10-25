import { describe, expect, it } from "vitest";

import { providerResponseHeaders } from "@/lib/provider-response-headers.server";

describe("providerResponseHeaders", () => {
  const headers = providerResponseHeaders("call-1", {
    bytes: new Uint8Array([1, 2, 3]),
    sha256: "f".repeat(64),
  });

  it("serves the bytes as an attachment of generic bytes that no browser may sniff", () => {
    expect(headers["Content-Type"]).toBe("application/octet-stream");
    expect(headers["Content-Disposition"]).toBe(
      'attachment; filename="provider-response-call-1.bin"'
    );
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("is never cached, sandboxed, and carries the length and recorded hash", () => {
    expect(headers["Cache-Control"]).toBe("private, no-store");
    expect(headers["Content-Security-Policy"]).toContain("sandbox");
    expect(headers["Content-Length"]).toBe("3");
    expect(headers["X-Content-SHA256"]).toBe("f".repeat(64));
  });
});
