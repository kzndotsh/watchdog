import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import { analyzeEmlText } from "../eml.ts";

describe("analyzeEmlText", () => {
  it("parses headers and body IOCs", () => {
    const snap = analyzeEmlText(
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

  it("trims padded evidenceId", () => {
    const id = testId(41);
    const snap = analyzeEmlText(`  ${id}  `, "Subject: x\n\nbody");
    expect(snap.evidenceId).toBe(id);
  });
});
