import { describe, expect, it } from "vitest";

import { upstreamDiagnostic } from "../diagnostic";

describe("upstreamDiagnostic", () => {
  it("keeps a bare HTTP status", () => {
    expect(upstreamDiagnostic("HTTP 502")).toBe("HTTP 502");
  });

  it("builds the status from a number", () => {
    expect(upstreamDiagnostic(undefined, 404)).toBe("HTTP 404");
  });

  it("prefers the numeric status over free text", () => {
    expect(upstreamDiagnostic("echo https://u:p@x.test/?t=1", 500)).toBe(
      "HTTP 500"
    );
  });

  it("withholds free text, which may echo the caller's input or a URL", () => {
    const out = upstreamDiagnostic("fetch failed for https://u:p@x.test/?t=1");
    expect(out).toBe("upstream error (details withheld)");
    expect(out).not.toMatch(/x\.test|u:p|t=1/);
  });

  it("withholds when there is nothing to report", () => {
    expect(upstreamDiagnostic(undefined)).toBe(
      "upstream error (details withheld)"
    );
  });
});
