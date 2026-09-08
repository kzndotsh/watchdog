import { describe, expect, it } from "vitest";

import { mergeEvidenceRecords } from "@/domains/intake/lib/evidence";
import type { EvidenceRecord } from "@/domains/intake/types";
import { testId } from "@watchdog/test-kit";

function evidenceRow(id: string, label: string): EvidenceRecord {
  return {
    id,
    caseId: testId(1),
    entityId: null,
    kind: "file",
    label,
    notes: null,
    mime: "text/plain",
    uri: null,
    sha256: null,
    text: null,
    sourceUrl: null,
    actorId: testId(2),
    actorLabel: "actor",
    capturedAt: "2026-01-01T00:00:00.000Z",
    processedAt: null,
    deletedAt: null,
  };
}

describe("mergeEvidenceRecords", () => {
  it("merges active and hidden lists without duplicate ids", () => {
    const active = [evidenceRow(testId(10), "active.txt")];
    const hidden = [evidenceRow(testId(11), "hidden.txt")];
    const merged = mergeEvidenceRecords(active, hidden);
    expect(merged.map((row) => row.id).sort()).toEqual(
      [testId(10), testId(11)].sort()
    );
  });

  it("prefers the later list when the same id appears twice", () => {
    const first = [evidenceRow(testId(10), "first")];
    const second = [evidenceRow(testId(10), "second")];
    expect(mergeEvidenceRecords(first, second)[0]?.label).toBe("second");
  });
});
