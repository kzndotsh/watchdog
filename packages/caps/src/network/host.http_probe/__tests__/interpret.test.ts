import { describe, it, expect } from "vitest";

import { testId } from "@watchdog/test-kit";

import { claimText, itRejectsIncompleteReport } from "../../../testing";
import { httpProbe } from "../cap.ts";
import { interpretHttpProbeReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    host: "example.com",
    queriedAt: "2026-01-01T00:00:00.000Z",
    finalUrl: "https://example.com/",
    status: 200,
    ok: true,
    securityHeaders: { "strict-transport-security": "max-age=1" },
    server: "ecs",
    via: null,
    cdnHints: [],
    securityTxt: {
      url: "https://example.com/.well-known/security.txt",
      status: 404,
      present: false,
      bodyPreview: null,
    },
    favicon: {
      url: "https://example.com/favicon.ico",
      status: 200,
      sha256: "abcdef0123456789",
      contentType: "image/x-icon",
    },
  };

  it("interpretHttpProbeReport proposes Claim", () => {
    const result = interpretHttpProbeReport(fixture, {
      input: { host: "example.com", entityId },
    });
    expect(result.patch.length).toBe(1);
    expect(claimText(result, 0)).toMatch(/status=200/);
  });

  itRejectsIncompleteReport(
    httpProbe,
    { host: "example.com" },
    { host: "example.com" }
  );
});
