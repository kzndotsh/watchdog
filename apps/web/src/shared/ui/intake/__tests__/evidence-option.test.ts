import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import {
  evidenceLabel,
  evidenceMatchesPickerFilter,
  evidencePrimaryLabel,
  evidenceSourceFootnote,
} from "../evidence-option";

describe("evidencePrimaryLabel", () => {
  it("prefers user label, then URL host, then kind", () => {
    expect(
      evidencePrimaryLabel({
        label: "note",
        kind: "attestation",
        sourceUrl: "https://example.com/page",
      })
    ).toBe("note");
    expect(
      evidencePrimaryLabel({
        label: null,
        kind: "url_archive",
        sourceUrl: "https://example.com/page",
      })
    ).toBe("example.com");
    expect(
      evidencePrimaryLabel({ label: null, kind: "file", sourceUrl: null })
    ).toBe("File");
  });
});

describe("evidenceLabel", () => {
  it("disambiguates bare evidence with sha or id suffix", () => {
    const id = testId(1);
    expect(
      evidenceLabel({
        id,
        kind: "file",
        sha256: "a".repeat(64),
      })
    ).toBe(`File · ${"a".repeat(8)}…`);
    expect(
      evidenceLabel({
        id,
        kind: "file",
      })
    ).toBe(`File · ${id.slice(0, 8)}…`);
  });

  it("uses hostname for URL evidence without custom label", () => {
    expect(
      evidenceLabel({
        id: testId(2),
        kind: "url_archive",
        sourceUrl: "https://example.com/page",
      })
    ).toBe("example.com");
  });
});

describe("evidenceSourceFootnote", () => {
  it("omits URL when primary label is already the hostname", () => {
    expect(
      evidenceSourceFootnote(
        {
          label: null,
          kind: "url_archive",
          sourceUrl: "https://example.com/page",
        },
        "example.com"
      )
    ).toBeNull();
  });

  it("keeps URL when primary label is a custom title", () => {
    expect(
      evidenceSourceFootnote(
        {
          label: "Landing page",
          kind: "url_archive",
          sourceUrl: "https://example.com/page",
        },
        "Landing page"
      )
    ).toBe("https://example.com/page");
  });
});

describe("evidenceMatchesPickerFilter", () => {
  it("matches source URL when a custom label hides the host", () => {
    const row = {
      id: testId(3),
      kind: "url_archive" as const,
      label: "Landing page",
      sourceUrl: "https://example.com/page",
    };
    expect(evidenceMatchesPickerFilter(row, "example.com")).toBe(true);
    expect(evidenceMatchesPickerFilter(row, "landing")).toBe(true);
    expect(evidenceMatchesPickerFilter(row, "missing")).toBe(false);
  });

  it("matches sha256 prefix for file evidence without a custom label", () => {
    const row = {
      id: testId(4),
      kind: "file" as const,
      sha256:
        "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
    };
    expect(evidenceMatchesPickerFilter(row, "aabbccdd")).toBe(true);
  });
});
