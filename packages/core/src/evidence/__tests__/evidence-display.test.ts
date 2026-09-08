import { describe, expect, it } from "vitest";

import {
  evidenceDisplayLabel,
  evidenceKindLabel,
} from "../evidence-display.ts";

describe("evidenceKindLabel", () => {
  it("maps known evidence kinds", () => {
    expect(evidenceKindLabel("attestation")).toBe("Attestation");
    expect(evidenceKindLabel("url_archive")).toBe("URL Archive");
  });
});

describe("evidenceDisplayLabel", () => {
  it("prefers trimmed label", () => {
    expect(evidenceDisplayLabel({ label: "  note  ", kind: "file" })).toBe(
      "note"
    );
  });

  it("falls back to source URL host when label is empty", () => {
    expect(
      evidenceDisplayLabel({
        label: null,
        kind: "url_archive",
        sourceUrl: "https://example.com/path",
      })
    ).toBe("example.com");
  });

  it("falls back to kind label when label is empty", () => {
    expect(evidenceDisplayLabel({ label: null, kind: "attestation" })).toBe(
      "Attestation"
    );
    expect(evidenceDisplayLabel({ label: "  ", kind: "file" })).toBe("File");
  });
});
