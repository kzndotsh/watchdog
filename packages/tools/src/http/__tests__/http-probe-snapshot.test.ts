import { describe, expect, it } from "vitest";

import { buildHttpProbeSnapshot } from "../http-probe-snapshot";

describe("buildHttpProbeSnapshot", () => {
  it("detects security.txt when Contact field is lowercase", () => {
    const body = "contact: mailto:security@mailhost.test\n";
    const snap = buildHttpProbeSnapshot({
      host: "mailhost.test",
      primary: {
        ok: true,
        status: 200,
        headers: new Headers(),
        finalUrl: "https://mailhost.test/",
      },
      securityTxtUrl: "https://mailhost.test/.well-known/security.txt",
      faviconUrl: "https://mailhost.test/favicon.ico",
      secTxt: {
        ok: true,
        status: 200,
        bytes: new TextEncoder().encode(body),
        contentType: "text/plain",
      },
      favicon: {
        ok: false,
        status: 404,
        bytes: new Uint8Array(),
        contentType: null,
      },
    });
    expect(snap.securityTxt.present).toBe(true);
    expect(snap.securityTxt.bodyPreview).toContain("contact:");
  });
});
