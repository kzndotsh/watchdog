import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import { analyzeFileBytes } from "../analyze.ts";

describe("analyzeFileBytes", () => {
  it("detects JPEG magic", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
    const snap = analyzeFileBytes(testId(40), bytes);
    expect(snap.magic).toBe("JPEG");
    expect(snap.mimeGuess).toBe("image/jpeg");
    expect(snap.byteLength).toBe(4);
  });

  it("trims padded evidenceId", () => {
    const id = testId(41);
    const snap = analyzeFileBytes(`  ${id}  `, new Uint8Array([0x00]));
    expect(snap.evidenceId).toBe(id);
  });
});

describe("analyzeFileBytes metadata parsers", () => {
  it("reads PDF Document Information values, not lookalike names", () => {
    const pdf = new TextEncoder().encode(
      "%PDF-1.4\n1 0 obj\n<< /Authority (no) /Author (Ada) /Creator (Word \\(x\\)) /Producer <4142> /Title (T) >>\nendobj\n"
    );
    const snap = analyzeFileBytes(testId(42), pdf);
    expect(snap.pdfHints).toEqual([
      "/Author (Ada)",
      "/Creator (Word \\(x\\))",
      "/Producer <4142>",
      "/Title (T)",
    ]);
  });

  it("does not report EXIF tags from text that merely names them", () => {
    const snap = analyzeFileBytes(
      testId(43),
      new TextEncoder().encode("Make Model Software Artist Copyright")
    );
    expect(snap.exifHints).toEqual([]);
  });
});
