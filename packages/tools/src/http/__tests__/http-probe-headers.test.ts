import { describe, expect, it } from "vitest";

import { detectCdnHints, pickSecurityHeaders } from "../http-probe-headers";

describe("http-probe-headers", () => {
  it("pickSecurityHeaders keeps known security headers only", () => {
    const headers = new Headers({
      "strict-transport-security": "max-age=1",
      server: "nginx",
      "x-frame-options": "DENY",
    });
    expect(pickSecurityHeaders(headers)).toEqual({
      "strict-transport-security": "max-age=1",
      "x-frame-options": "DENY",
    });
  });

  it("detectCdnHints recognizes Cloudflare and AWS markers", () => {
    const cf = new Headers({ "cf-ray": "abc", server: "cloudflare" });
    expect(detectCdnHints(cf)).toEqual(["cloudflare"]);

    const aws = new Headers({ "x-amz-request-id": "1", server: "AmazonS3" });
    expect(detectCdnHints(aws)).toEqual(["aws"]);
  });
});
