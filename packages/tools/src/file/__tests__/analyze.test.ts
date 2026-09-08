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
