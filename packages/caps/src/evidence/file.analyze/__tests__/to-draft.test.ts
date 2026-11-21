import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/domain/test-kit";

import { fileAnalyzeToDraft } from "../to-draft.ts";

describe("fileAnalyzeToDraft", () => {
  it("summarizes magic and sha without inventing identifiers", () => {
    const draft = fileAnalyzeToDraft({
      evidenceId: testId(40),
      queriedAt: "2026-01-01T00:00:00.000Z",
      byteLength: 12,
      sha256: "ab".repeat(32),
      magic: "JPEG",
      mimeGuess: "image/jpeg",
      exifHints: ["Make"],
      pdfHints: [],
      textPreview: null,
    });
    expect(draft.identifiers).toEqual([]);
    expect(draft.claims[0]?.text).toMatch(/JPEG/);
    expect(draft.claims.some((row) => row.text.includes("Make"))).toBe(true);
  });
});
