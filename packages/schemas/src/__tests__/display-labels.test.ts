import { describe, expect, it } from "vitest";

import {
  EVIDENCE_KIND_LABELS,
  enumValuesMatchingDisplayLabel,
} from "../display-labels";
import { EVIDENCE_KINDS } from "../vocab";

describe("enumValuesMatchingDisplayLabel", () => {
  it("matches enum values by display label substring", () => {
    expect(
      enumValuesMatchingDisplayLabel(
        "URL Archive",
        EVIDENCE_KINDS,
        EVIDENCE_KIND_LABELS
      )
    ).toEqual(["url_archive"]);
  });

  it("returns no matches for blank or unrelated terms", () => {
    expect(
      enumValuesMatchingDisplayLabel("  ", EVIDENCE_KINDS, EVIDENCE_KIND_LABELS)
    ).toEqual([]);
    expect(
      enumValuesMatchingDisplayLabel(
        "missing",
        EVIDENCE_KINDS,
        EVIDENCE_KIND_LABELS
      )
    ).toEqual([]);
  });

  it("matches enum values by raw value substring", () => {
    expect(
      enumValuesMatchingDisplayLabel(
        "url_archive",
        EVIDENCE_KINDS,
        EVIDENCE_KIND_LABELS
      )
    ).toEqual(["url_archive"]);
  });
});
