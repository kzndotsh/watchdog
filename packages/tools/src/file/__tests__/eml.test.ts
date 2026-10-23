import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import { analyzeEmlText } from "../eml.ts";

describe("analyzeEmlText", () => {
  it("parses headers and body IOCs", async () => {
    const snap = await analyzeEmlText(
      testId(40),
      [
        "From: Ada <ada@mailhost.test>",
        "Subject: Hello",
        "Message-Id: <1@mailhost.test>",
        "",
        "See https://mailhost.test/note",
      ].join("\n")
    );
    expect(snap.from).toMatch(/ada@mailhost\.test/i);
    expect(snap.subject).toBe("Hello");
    expect(snap.urls.some((url) => url.includes("mailhost.test"))).toBe(true);
    expect(snap.emails).toContain("ada@mailhost.test");
  });

  it("reads IOCs from decoded multipart parts", async () => {
    const html = Buffer.from(
      '<a href="https://encoded.test/path">bob@encoded.test</a>'
    ).toString("base64");
    const snap = await analyzeEmlText(
      testId(42),
      [
        "From: Ada <ada@mailhost.test>",
        "MIME-Version: 1.0",
        'Content-Type: multipart/alternative; boundary="b1"',
        "",
        "--b1",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        "Visit https://qp.test/a=3Db and write carol@qp.test",
        "--b1",
        "Content-Type: text/html; charset=utf-8",
        "Content-Transfer-Encoding: base64",
        "",
        html,
        "--b1--",
      ].join("\r\n")
    );
    expect(snap.urls).toEqual([
      "https://qp.test/a=b",
      "https://encoded.test/path",
    ]);
    expect(snap.emails).toEqual([
      "ada@mailhost.test",
      "carol@qp.test",
      "bob@encoded.test",
    ]);
    expect(snap.bodyPreview).toContain("https://qp.test/a=b");
  });

  it("trims padded evidenceId", async () => {
    const id = testId(41);
    const snap = await analyzeEmlText(`  ${id}  `, "Subject: x\n\nbody");
    expect(snap.evidenceId).toBe(id);
  });
});
