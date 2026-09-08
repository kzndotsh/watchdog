import { describe, expect, it } from "vitest";

import { fileAnalyze } from "../cap.ts";

describe("fileAnalyze.handoff", () => {
  it("hands off sha256 for hash playbook steps", () => {
    const hash = "a".repeat(64);
    const bag = fileAnalyze.handoff?.({
      summary: "Analyzed file Evidence (unknown)",
      identifiers: [],
      claims: [],
      questions: [],
      sha256: hash,
    });
    expect(bag).toEqual({ hash: [hash] });
  });

  it("returns undefined when sha256 is missing", () => {
    expect(
      fileAnalyze.handoff?.({
        summary: "Analyzed file Evidence (unknown)",
        identifiers: [],
        claims: [],
        questions: [],
      })
    ).toBeUndefined();
  });

  it("returns undefined for invalid report shapes", () => {
    expect(fileAnalyze.handoff?.(null)).toBeUndefined();
    expect(fileAnalyze.handoff?.({ sha256: "" })).toBeUndefined();
  });
});
