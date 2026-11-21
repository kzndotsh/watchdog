import { describe, expect, it } from "vitest";

import {
  evidenceDisplayLabel,
  evidenceTitleMapFromRows,
} from "../evidence-display";

describe("evidenceDisplayLabel", () => {
  it("prefers trimmed user label", () => {
    expect(evidenceDisplayLabel({ label: "  note  ", kind: "file" })).toBe(
      "note"
    );
  });

  it("falls back to URL host then kind label", () => {
    expect(
      evidenceDisplayLabel({
        label: null,
        kind: "url_archive",
        sourceUrl: "https://example.com/path",
      })
    ).toBe("example.com");
    expect(evidenceDisplayLabel({ label: null, kind: "attestation" })).toBe(
      "Attestation"
    );
  });
});

describe("evidenceTitleMapFromRows", () => {
  it("filters to needed ids", () => {
    const map = evidenceTitleMapFromRows(
      [
        { id: "a", label: "Alpha", kind: "file" },
        {
          id: "b",
          label: null,
          kind: "url_archive",
          sourceUrl: "https://example.com/x",
        },
      ],
      new Set(["b"])
    );
    expect(map.size).toBe(1);
    expect(map.get("b")).toBe("example.com");
  });
});
