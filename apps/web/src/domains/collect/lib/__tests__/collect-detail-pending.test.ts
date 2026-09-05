import { describe, expect, it } from "vitest";

import { collectDetailPending } from "@/domains/collect/lib/collect-detail-pending";
import type { CollectRow } from "@/domains/collect/types";
import type { EvidenceRecord } from "@/domains/intake/types";
import { testId } from "@watchdog/test-kit";

function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: testId(40),
    caseId: testId(10),
    entityId: testId(20),
    kind: "attestation",
    label: "carrier-lookup.txt",
    notes: null,
    mime: "text/plain",
    uri: null,
    sha256: null,
    text: "hello",
    sourceUrl: null,
    actorId: "test-actor",
    actorLabel: "test-actor",
    capturedAt: "2026-01-02T00:00:00.000Z",
    processedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function evidenceRow(rowEvidence: EvidenceRecord): CollectRow {
  return {
    id: rowEvidence.id,
    title: rowEvidence.label ?? rowEvidence.kind,
    hint: null,
    state: "landed",
    when: rowEvidence.capturedAt,
    entityId: rowEvidence.entityId,
    evidence: rowEvidence,
    runs: [],
    playbookRunId: null,
    recipe: null,
  };
}

describe("collectDetailPending", () => {
  it("does not skeleton evidence rows once queue data is warm", () => {
    const row = evidenceRow(evidence());
    expect(
      collectDetailPending({
        selected: row,
        queueCorePending: false,
        detailIsJobRow: false,
        jobDetailPending: false,
      })
    ).toBe(false);
  });

  it("still skeletons while queue core lists are pending", () => {
    const row = evidenceRow(evidence());
    expect(
      collectDetailPending({
        selected: row,
        queueCorePending: true,
        detailIsJobRow: false,
        jobDetailPending: false,
      })
    ).toBe(true);
  });

  it("waits for job detail on job-only rows", () => {
    const jobRow: CollectRow = {
      id: testId(11),
      title: "DNS Lookup",
      hint: "example.com",
      state: "running",
      when: "2026-01-03T00:00:00.000Z",
      entityId: null,
      evidence: null,
      runs: [],
      playbookRunId: null,
      recipe: null,
    };
    expect(
      collectDetailPending({
        selected: jobRow,
        queueCorePending: false,
        detailIsJobRow: true,
        jobDetailPending: true,
      })
    ).toBe(true);
  });
});
